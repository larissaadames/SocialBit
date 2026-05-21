from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, text, func, and_
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from jose import jwt, JWTError
from pathlib import Path
import hashlib
import re

# --- 1. CONFIGURAÇÃO DO BANCO DE DADOS ---
DB_USER = "root"
DB_PASSWORD = "1234"  
DB_HOST = "localhost"
DB_NAME = "socialbit"

SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 2. MODELOS DO BANCO ---
class Usuario(Base):
    __tablename__ = "Usuario"
    ID = Column(Integer, primary_key=True, index=True)
    username = Column(String(25), unique=True)
    dtNasc = Column(String(10)) 
    email = Column(String(100), unique=True)
    senha = Column(String(100))
    nome = Column(String(50))
    sobrenome = Column(String(50))
    telefone = Column(String(20))
    role = Column(String(20), nullable=False, default="usuario")
    bio = Column(Text, nullable=True)
    foto_url = Column(Text, nullable=True)

class Post(Base):
    __tablename__ = "Post"
    ID = Column(Integer, primary_key=True, index=True)
    conteudo = Column("texto", Text)
    votos = Column("voto", Integer, default=0)

class PostUsuario(Base):
    __tablename__ = "Post_Ususario"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True)

class PostSalvo(Base):
    __tablename__ = "PostSalvo"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True)

class Votacao(Base):
    __tablename__ = "Votacao"
    ID = Column(Integer, primary_key=True, index=True)
    tipo = Column("Tipo", String(20), default="post")  
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), nullable=True)
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), nullable=True)
    valor = Column("valor", Integer, default=0)  

# --- 3. ESQUEMAS DE VALIDAÇÃO (PYDANTIC) ---
class LoginRequest(BaseModel):
    email: str
    senha: str

class CadastroUsuario(BaseModel):
    username: str
    dtNasc: str
    senha: str
    email: str
    nome: str
    sobrenome: str
    telefone: str

class UserUpdate(BaseModel):
    id: int
    nome: str
    sobrenome: str
    bio: str
    telefone: str
    dtNasc: str
    foto_url: Optional[str] = None

class PostCreate(BaseModel):
    usuario_id: int
    conteudo: str

class PostCreateAuth(BaseModel):
    conteudo: str

# --- 4. INICIALIZAÇÃO E ARQUIVOS ESTÁTICOS ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")

templates = Jinja2Templates(directory="templates")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def startup_db():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as error:
        print(f"Aviso: nao foi possivel conectar ao banco no startup: {error}")
    ensure_schema_compatibility()

def ensure_schema_compatibility():
    def column_exists(conn, table_name: str, column_name: str) -> bool:
        row = conn.execute(
            text(
                """
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table_name AND COLUMN_NAME = :column_name LIMIT 1
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).first()
        return row is not None

    try:
        with engine.begin() as conn:
            if not column_exists(conn, "Votacao", "valor"):
                conn.execute(text("ALTER TABLE Votacao ADD COLUMN valor INT NULL DEFAULT 0"))
    except Exception as error:
        print(f"Aviso: nao foi possivel ajustar schema do banco: {error}")

# --- 5. LÓGICA DE AUTENTICAÇÃO E SEGURANÇA ---
SECRET_KEY = "troque-esta-chave"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 24
PHONE_REGEX = re.compile(r"^\(\d{2}\)\s\d{4,5}-\d{4}$")

def create_access_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def is_probably_hash(stored_password: str) -> bool:
    if not stored_password or len(stored_password) != 64: return False
    return all(char in "0123456789abcdef" for char in stored_password.lower())

def verify_password(plain_password: str, stored_password: str) -> bool:
    if is_probably_hash(stored_password):
        return get_password_hash(plain_password) == stored_password
    return plain_password == stored_password

def validate_phone_or_raise(phone: str):
    if not phone or not phone.strip(): return 
    if not PHONE_REGEX.fullmatch(phone.strip()):
        raise HTTPException(status_code=400, detail="Telefone inválido. Use o formato (00) 00000-0000")

def get_current_user_id(request: Request) -> int:
    token = None
    auth_header = request.headers.get("authorization")
    
    if auth_header and auth_header.startswith("Bearer "):
        parts = auth_header.split(" ", 1)
        if len(parts) > 1 and parts[1].strip() not in ["null", "undefined", ""]:
            token = parts[1].strip()

    if not token:
        token = request.cookies.get("access_token")

    if not token or token in ["null", "undefined", ""]:
        raise HTTPException(status_code=401, detail="Token ausente ou inválido")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")

def require_authenticated_page(request: Request) -> Optional[RedirectResponse]:
    token = request.cookies.get("access_token")
    if not token: return RedirectResponse(url="/login")
    try: jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError: return RedirectResponse(url="/login")
    return None

def normalize_role(value: Optional[str]) -> str:
    role = (value or "").strip().lower()
    if role in {"admin", "administrador"}: return "admin"
    return "usuario"

def get_user_role(usuario: Usuario) -> str:
    return normalize_role(usuario.role)

def user_can_manage(target_user_id: int, current_user: Usuario) -> bool:
    return int(current_user.ID) == int(target_user_id) or get_user_role(current_user) == "admin"

# --- 6. ROTAS DE RENDERIZAÇÃO DE PÁGINAS (SSR) ---
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return RedirectResponse(url="/login")

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse(request, "login.html", {"request": request})

@app.get("/cadastro", response_class=HTMLResponse)
async def cadastro_page(request: Request):
    return templates.TemplateResponse(request, "cadastro.html", {"request": request})

@app.get("/home", response_class=HTMLResponse)
async def home_page(request: Request, db: Session = Depends(get_db)):
    # 1. Proteção de página: Se não estiver logado, vai para o login
    redirect = require_authenticated_page(request)
    if redirect: return redirect
    
    # 2. Obtém o ID do usuário logado para saber quais posts ele já votou ou salvou
    try:
        user_id = get_current_user_id(request)
        usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    except:
        return RedirectResponse(url="/login")

    # 3. Busca os posts no banco já formatados (mesma lógica da API)
    posts_raw = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, PostUsuario.usuario_id,
            Usuario.username, Usuario.foto_url, PostSalvo.post_id.label("salvo_post_id"),
            Votacao.valor.label("voto_usuario")
        )
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .outerjoin(Votacao, and_(Votacao.post_id == Post.ID, Votacao.usuario_id == user_id))
        .order_by(Post.ID.desc())
        .all()
    )

    # 4. Renderiza a página passando os posts e os dados do usuário para o Jinja2
    return templates.TemplateResponse(request, "index.html", {
        "request": request, 
        "posts": posts_raw,
        "usuario_logado": usuario_logado,
        "is_admin": get_user_role(usuario_logado) == "admin"
    })

@app.get("/perfil", response_class=HTMLResponse)
async def perfil_page(request: Request, id: Optional[int] = None, db: Session = Depends(get_db)):
    # 1. Barreira de segurança por Cookie: Se não houver cookie válido, vai para o login
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    try:
        current_user_id = get_current_user_id(request)
        target_id = id if id else current_user_id
        
        usuario_perfil = db.query(Usuario).filter(Usuario.ID == target_id).first()
        usuario_logado = db.query(Usuario).filter(Usuario.ID == current_user_id).first()

        if not usuario_perfil or not usuario_logado:
            return RedirectResponse(url="/home")

        pode_editar = (current_user_id == target_id) or (get_user_role(usuario_logado) == "admin")

        return templates.TemplateResponse(request, "perfil.html", {
            "request": request,
            "u": usuario_perfil,
            "usuario_logado": usuario_logado,
            "pode_editar": pode_editar
        })
    except Exception as e:
        # Removido o redirecionamento cego. Agora o erro real aparece no terminal do Uvicorn!
        print(f"\n❌ --- ERRO CRÍTICO DE RENDERIZAÇÃO NO JINJA2: {e} ---\n")
        raise e

# --- 7. ROTAS DE API (USUÁRIOS E AUTENTICAÇÃO) ---
@app.get("/auth/me")
async def obter_sessao_atual(request: Request, db: Session = Depends(get_db)):
    try:
        user_id = get_current_user_id(request)
        usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
        if not usuario: raise HTTPException(status_code=401, detail="Sessão inválida")
        return {"id": usuario.ID, "username": usuario.username, "perfil": get_user_role(usuario), "foto_url": usuario.foto_url or ""}
    except HTTPException:
        raise HTTPException(status_code=401, detail="Não autenticado")

@app.post("/login")
async def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if not usuario or not verify_password(dados.senha, usuario.senha):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")

    if not is_probably_hash(usuario.senha):
        usuario.senha = get_password_hash(dados.senha)
        db.commit()

    token = create_access_token(usuario.ID)
    response = JSONResponse({
        "message": "Sucesso", "id": usuario.ID, "username": usuario.username,
        "perfil": get_user_role(usuario), "foto_url": usuario.foto_url or "",
        "access_token": token, "token_type": "bearer",
    })
    response.set_cookie(key="access_token", value=token, max_age=TOKEN_EXPIRE_MINUTES * 60, samesite="lax")
    return response

@app.post("/usuarios")
async def cadastrar_usuario(usuario: CadastroUsuario, db: Session = Depends(get_db)):
    username_limpo = usuario.username.strip()
    if not username_limpo: raise HTTPException(status_code=400, detail="Username inválido")
    db_user = db.query(Usuario).filter(Usuario.email == usuario.email).first()
    if db_user: raise HTTPException(status_code=400, detail="Email já cadastrado")
    db_username = db.query(Usuario).filter(func.lower(Usuario.username) == username_limpo.lower()).first()
    if db_username: raise HTTPException(status_code=400, detail="Username já cadastrado")

    validate_phone_or_raise(usuario.telefone)
    novo_usuario = Usuario(
        username=username_limpo, dtNasc=usuario.dtNasc, senha=get_password_hash(usuario.senha),
        email=usuario.email, nome=usuario.nome, sobrenome=usuario.sobrenome,
        telefone=usuario.telefone, role="usuario", bio="", foto_url=""
    )
    db.add(novo_usuario)
    db.commit()
    return {"message": "Usuário cadastrado com sucesso"}

@app.delete("/usuarios/{user_id}")
async def deletar_usuario(user_id: int, request: Request, db: Session = Depends(get_db)):
    current_user_id = get_current_user_id(request)
    usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario: raise HTTPException(status_code=404, detail="Usuario não encontrado")
    
    current_user = db.query(Usuario).filter(Usuario.ID == current_user_id).first()
    if not current_user or not user_can_manage(user_id, current_user): 
        raise HTTPException(status_code=403, detail="Sem permissão")
    try:
        db.query(PostSalvo).filter(PostSalvo.usuario_id == user_id).delete()
        db.query(PostUsuario).filter(PostUsuario.usuario_id == user_id).delete()
        db.delete(usuario)
        db.commit()
        return {"message": "Conta excluída com sucesso"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro interno")

@app.get("/usuarios/busca")
async def buscar_usuarios(username: str, request: Request, db: Session = Depends(get_db)):
    get_current_user_id(request)
    termo = username.strip()
    if not termo: return []
    usuarios = db.query(Usuario).filter(Usuario.username.like(f"%{termo}%")).limit(10).all()
    return [{"id": u.ID, "username": u.username, "nome": u.nome, "sobrenome": u.sobrenome} for u in usuarios]

@app.get("/usuarios/{user_id}")
async def obter_perfil(user_id: str, request: Request, db: Session = Depends(get_db)):
    get_current_user_id(request)
    if user_id in ["null", "undefined", ""]: raise HTTPException(status_code=400, detail="ID inválido")
    usuario = db.query(Usuario).filter(Usuario.ID == int(user_id)).first()
    if not usuario: raise HTTPException(status_code=404, detail="Não encontrado")
    return {"id": usuario.ID, "username": usuario.username, "nome": usuario.nome, "sobrenome": usuario.sobrenome, "bio": usuario.bio or "", "telefone": usuario.telefone or "", "dtNasc": usuario.dtNasc or "", "foto_url": usuario.foto_url or "", "perfil": get_user_role(usuario)}

@app.put("/usuarios/update")
async def atualizar_perfil(dados: UserUpdate, request: Request, db: Session = Depends(get_db)):
    current_user_id = get_current_user_id(request)
    db_user = db.query(Usuario).filter(Usuario.ID == dados.id).first()
    if not db_user: raise HTTPException(status_code=404, detail="Não encontrado")
    
    current_user = db.query(Usuario).filter(Usuario.ID == current_user_id).first()
    if not current_user or not user_can_manage(dados.id, current_user): 
        raise HTTPException(status_code=403, detail="Sem permissão")
        
    validate_phone_or_raise(dados.telefone)
    if len(dados.nome.strip()) < 2 or len(dados.sobrenome.strip()) < 2: raise HTTPException(status_code=400, detail="Muito curto")
    try:
        data_nasc = datetime.strptime(dados.dtNasc, "%Y-%m-%d")
        if ((datetime.now() - data_nasc).days // 365) < 16: raise HTTPException(status_code=400, detail="Idade mínima de 16 anos")
    except ValueError: raise HTTPException(status_code=400, detail="Data inválida")
    
    db_user.nome = dados.nome
    db_user.sobrenome = dados.sobrenome
    db_user.bio = dados.bio
    db_user.telefone = dados.telefone
    db_user.dtNasc = dados.dtNasc
    if dados.foto_url: db_user.foto_url = dados.foto_url
    db.commit()
    return {"message": "Perfil updated com sucesso"}

# --- 8. ROTAS DE POSTS E SINCRO DE VOTOS ---
@app.get("/posts")
async def listar_posts(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    posts = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, PostUsuario.usuario_id,
            Usuario.username, Usuario.foto_url, PostSalvo.post_id.label("salvo_post_id"),
            Votacao.valor.label("voto_usuario")
        )
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .outerjoin(Votacao, and_(Votacao.post_id == Post.ID, Votacao.usuario_id == user_id))
        .order_by(Post.ID.desc())
        .all()
    )
    return [{
        "id": p.ID, "conteudo": p.conteudo, "votos": p.votos or 0, "autor": p.username,
        "autor_id": p.usuario_id, "usuario_id": p.usuario_id, "username": p.username,
        "foto_url": p.foto_url or "", "salvo": p.salvo_post_id is not None,
        "voto": p.voto_usuario or 0  
    } for p in posts]

@app.get("/posts/saved")
async def listar_posts_salvos(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    posts = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, PostUsuario.usuario_id,
            Usuario.username, Usuario.foto_url, Votacao.valor.label("voto_usuario")
        )
        .join(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(Votacao, and_(Votacao.post_id == Post.ID, Votacao.usuario_id == user_id))
        .filter(PostSalvo.usuario_id == user_id)
        .order_by(Post.ID.desc())
        .all()
    )
    return [{
        "id": p.ID, "conteudo": p.conteudo, "votos": p.votos or 0, "autor": p.username,
        "autor_id": p.usuario_id, "usuario_id": p.usuario_id, "username": p.username,
        "foto_url": p.foto_url or "", "salvo": True, "voto": p.voto_usuario or 0
    } for p in posts]

@app.post("/posts")
async def criar_post_autenticado(dados: PostCreateAuth, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo: raise HTTPException(status_code=400, detail="Vazio")
    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1
    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, votos=0)
    db.add(novo_post)
    db.flush()
    db.add(PostUsuario(usuario_id=user_id, post_id=novo_post_id))
    db.commit()
    db.refresh(novo_post)
    autor = db.query(Usuario).filter(Usuario.ID == user_id).first()
    return {"id": novo_post_id, "conteudo": novo_post.conteudo, "votos": novo_post.votos or 0, "usuario_id": user_id, "username": autor.username if autor else "usuario", "foto_url": autor.foto_url if autor else "", "salvo": False}

@app.post("/posts/criar")
async def criar_post(dados: PostCreate, request: Request, db: Session = Depends(get_db)):
    current_user_id = get_current_user_id(request)
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo: raise HTTPException(status_code=400, detail="Vazio")
    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1
    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, votos=0)
    db.add(novo_post)
    db.flush()
    if int(dados.usuario_id) != int(current_user_id): raise HTTPException(status_code=403, detail="Sem permissão")
    db.add(PostUsuario(usuario_id=current_user_id, post_id=novo_post_id))
    db.commit()
    return {"message": "Post criado com sucesso"}

@app.put("/posts/{post_id}/votar")
async def votar(post_id: int, tipo: str, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404, detail="Post não encontrado")
    
    votacao = db.query(Votacao).filter(Votacao.post_id == post_id, Votacao.usuario_id == user_id).first()
    voto_atual = votacao.valor if votacao else 0

    if tipo == "up":
        if voto_atual == 1: pass
        elif voto_atual == -1:
            post.votos = (post.votos or 0) + 2
            votacao.valor = 1
        else:
            post.votos = (post.votos or 0) + 1
            if votacao: votacao.valor = 1
            else:
                ultimo_id = db.query(func.max(Votacao.ID)).scalar() or 0
                db.add(Votacao(ID=int(ultimo_id) + 1, tipo="post", post_id=post_id, usuario_id=user_id, valor=1))
    
    elif tipo == "down":
        if voto_atual == -1: pass
        elif voto_atual == 1:
            post.votos = (post.votos or 0) - 2
            votacao.valor = -1
        else:
            post.votos = (post.votos or 0) - 1
            if votacao: votacao.valor = -1
            else:
                ultimo_id = db.query(func.max(Votacao.ID)).scalar() or 0
                db.add(Votacao(ID=int(ultimo_id) + 1, tipo="post", post_id=post_id, usuario_id=user_id, valor=-1))
                
    elif tipo == "cancel":
        if voto_atual == 1:
            post.votos = (post.votos or 0) - 1
            votacao.valor = 0
        elif voto_atual == -1:
            post.votos = (post.votos or 0) + 1
            votacao.valor = 0

    db.commit()
    return {"votos": post.votos}

@app.post("/posts/{post_id}/save")
async def salvar_post(post_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404)
    ja_salvo = db.query(PostSalvo).filter(PostSalvo.post_id == post_id, PostSalvo.usuario_id == user_id).first()
    if ja_salvo: return {"message": "Já salvo"}
    db.add(PostSalvo(usuario_id=user_id, post_id=post_id))
    db.commit()
    return {"message": "Salvo com sucesso"}

@app.delete("/posts/{post_id}/save")
async def remover_post_salvo(post_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404)
    salvo = db.query(PostSalvo).filter(PostSalvo.post_id == post_id, PostSalvo.usuario_id == user_id).first()
    if not salvo: return {"message": "Não estava salvo"}
    db.delete(salvo)
    db.commit()
    return {"message": "Removido"}

@app.delete("/posts/{post_id}")
async def remover_post(post_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404)
    relacionamento = db.query(PostUsuario).filter(PostUsuario.post_id == post_id).first()
    if not relacionamento: raise HTTPException(status_code=404)
    
    current_user = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not current_user or (int(relacionamento.usuario_id) != int(user_id) and get_user_role(current_user) != "admin"): 
        raise HTTPException(status_code=403, detail="Sem permissão")
        
    db.query(PostSalvo).filter(PostSalvo.post_id == post_id).delete(synchronize_session=False)
    db.query(PostUsuario).filter(PostUsuario.post_id == post_id).delete(synchronize_session=False)
    db.delete(post)
    db.commit()
    return {"message": "Removido com sucesso"}

@app.put("/posts/{post_id}")
async def atualizar_post(post_id: int, dados: PostCreateAuth, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo: raise HTTPException(status_code=400, detail="Vazio")
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404)
    relacionamento = db.query(PostUsuario).filter(PostUsuario.post_id == post_id).first()
    if not relacionamento: raise HTTPException(status_code=404)
    
    current_user = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not current_user or (int(relacionamento.usuario_id) != int(user_id) and get_user_role(current_user) != "admin"): 
        raise HTTPException(status_code=403, detail="Sem permissão")
        
    post.conteudo = conteudo_limpo
    db.commit()
    return {"message": "Atualizado com sucesso", "conteudo": post.conteudo}