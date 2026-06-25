from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, text, func, and_, Float
from sqlalchemy.orm import sessionmaker, Session, declarative_base  
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from jose import jwt, JWTError
from pathlib import Path
import hashlib
import re
import bcrypt  

# --- CONFIGURAÇÃO GLOBAL DE SEGURANÇA ---
SECRET_KEY = "troque-esta-chave"
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 300
PHONE_REGEX = re.compile(r"^\(\d{2}\)\s\d{4,5}-\d{4}$")

def get_password_hash(password: str) -> str:
    """Transforma a senha em um hash criptográfico irreversível (Bcrypt nativo) para salvar no banco."""
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def verify_password(plain_password: str, stored_password: str) -> bool:
    """Compara a senha digitada com suporte inteligente a Bcrypt nativo, SHA-256 e Texto Puro legado."""
    if not stored_password:
        return False
        
    stored_password = str(stored_password).strip()

    try:
        if stored_password.startswith(("$2b$", "$2a$", "$2y$")):
            return bcrypt.checkpw(plain_password.encode("utf-8"), stored_password.encode("utf-8"))
    except Exception:
        pass

    if len(stored_password) == 64 and all(char in "0123456789abcdef" for char in stored_password.lower()):
        return hashlib.sha256(plain_password.encode("utf-8")).hexdigest() == stored_password

    return plain_password == stored_password

# --- 1. CONFIGURAÇÃO DO BANCO DE DADOS ---
DB_USER = "root"
DB_PASSWORD = "6540"  
DB_HOST = "localhost"
DB_NAME = "socialbit"

SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=5,
    max_overflow=10,        
    pool_recycle=1800,      
    pool_timeout=15         
)
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
    sobrenome = Column(String(50), nullable=False)
    universidade = Column(String(50))
    altura = Column((Float), nullable=False)
    telefone = Column(String(20))
    role = Column(String(20), nullable=False, default="usuario")
    status_moderacao = Column(String(30), nullable=False, default="ativo")
    bio = Column(Text, nullable=True)
    foto_url = Column(Text, nullable=True)

class Post(Base):
    __tablename__ = "Post"
    ID = Column(Integer, primary_key=True, index=True)
    conteudo = Column("texto", Text)
    votos = Column("voto", Integer, default=0)
    categoria = Column("categoria", String(50), nullable=True)
    data_criacao = Column("data_criacao", String(19), nullable=True)
    imagem_url = Column("imagem_url", Text, nullable=True)

class PostUsuario(Base):
    __tablename__ = "Post_Ususario"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True)

class PostSalvo(Base):
    __tablename__ = "PostSalvo"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True) 

class Comentario(Base):
    __tablename__ = "Comentario"
    ID = Column(Integer, primary_key=True, index=True)
    texto = Column(Text)
    votos = Column("voto", Integer, default=0)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"))
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"))
    comentario_pai_id = Column("fk_Comentario_Pai_ID", Integer, ForeignKey("Comentario.ID"), nullable=True)
    imagem_url = Column("imagem_url", Text, nullable=True)
    data_criacao = Column("data_criacao", String(19), nullable=True)

class Votacao(Base):
    __tablename__ = "Votacao"
    ID = Column(Integer, primary_key=True, index=True)
    tipo = Column("Tipo", String(20), default="post")  
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), nullable=True)
    comentario_id = Column("fk_Comentario_ID", Integer, ForeignKey("Comentario.ID"), nullable=True)
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), nullable=True)
    valor = Column("valor", Integer, default=0)  

class Denuncia(Base):
    __tablename__ = "Denuncia"
    ID = Column(Integer, primary_key=True, index=True)
    categoria = Column(String(80))
    detalhes = Column(Text, nullable=True)
    status = Column(String(20), default="pendente")
    data_criacao = Column(String(19), nullable=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), nullable=True)
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), nullable=True)

# --- 3. ESQUEMAS DE VALIDAÇÃO (PYDANTIC) ---
class LoginRequest(BaseModel):
    email: str
    senha: str

class UsuarioCreate(BaseModel):
    username: str
    dtNasc: str
    senha: str
    email: str
    nome: str
    sobrenome: str
    universidade: str
    altura: float
    telefone: str

class UserUpdate(BaseModel):
    id: int
    nome: str
    sobrenome: str
    universidade: str
    altura: float
    bio: str
    telefone: str
    dtNasc: str
    foto_url: Optional[str] = None

class PostCreate(BaseModel):
    usuario_id: int
    conteudo: str
    categoria: str

class PostCreateAuth(BaseModel):
    conteudo: str
    imagem_url: Optional[str] = None

class ComentarioCreate(BaseModel):
    texto: str
    comentario_pai_id: Optional[int] = None
    imagem_url: Optional[str] = None

class DenunciaCreate(BaseModel):
    categoria: str
    detalhes: Optional[str] = ""

class AdminUserAction(BaseModel):
    acao: str

class AdminReportStatus(BaseModel):
    status: str

# --- 4. INICIALIZAÇÃO E ARQUIVOS ESTÁTICOS ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MIDDLEWARE DE SESSÃO DESLIZANTE (SLIDING EXPIRATION) ---
@app.middleware("http")
async def sliding_session_middleware(request: Request, call_next):
    response = await call_next(request)
    token = request.cookies.get("access_token")
    if token and token not in ["null", "undefined", ""]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                new_payload = {
                    "sub": str(user_id),
                    "exp": datetime.utcnow() + timedelta(seconds=TOKEN_EXPIRE_SECONDS)
                }
                new_token = jwt.encode(new_payload, SECRET_KEY, algorithm=ALGORITHM)
                response.set_cookie(
                    key="access_token", 
                    value=new_token, 
                    max_age=TOKEN_EXPIRE_SECONDS, 
                    samesite="lax"
                )
        except JWTError:
            pass
    return response

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
        print(f"Aviso: não foi possível conectar ao banco no startup: {error}")
    ensure_schema_compatibility()

# --- ENGENHARIA DE EXPANSÃO DE SCHEMA AUTOMÁTICA ---
def ensure_schema_compatibility():
    def column_exists(conn, table_name: str, column_name: str) -> bool:
        row = conn.execute(
            text(
                """
                SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() 
                AND LOWER(TABLE_NAME) = LOWER(:table_name) 
                AND LOWER(COLUMN_NAME) = LOWER(:column_name) 
                LIMIT 1
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).first()
        return row is not None

    try:
        with engine.begin() as conn:
            # 🔥 ENGINE AUTOMÁTICA: Modifica a coluna de senha antiga para suportar os 60 caracteres do Bcrypt
            try:
                conn.execute(text("ALTER TABLE Usuario MODIFY COLUMN senha VARCHAR(100)"))
                print("🔹 [DATABASE]: Coluna 'senha' expandida com sucesso para VARCHAR(100) para suportar Bcrypt.")
            except Exception as alter_err:
                print(f"Aviso ao expandir coluna senha: {alter_err}")

            try:
                if not column_exists(conn, "Votacao", "valor"):
                    conn.execute(text("ALTER TABLE Votacao ADD COLUMN valor INT NULL DEFAULT 0"))
            except Exception: pass

            try:
                if not column_exists(conn, "Votacao", "fk_Comentario_ID"):
                    conn.execute(text("ALTER TABLE Votacao ADD COLUMN fk_Comentario_ID INT NULL"))
            except Exception: pass

            try:
                if not column_exists(conn, "Post", "data_criacao"):
                    conn.execute(text("ALTER TABLE Post ADD COLUMN data_criacao VARCHAR(19) NULL"))
                    conn.execute(text("UPDATE Post SET data_criacao = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') WHERE data_criacao IS NULL"))
            except Exception: pass

            try:
                if not column_exists(conn, "Post", "imagem_url"):
                    conn.execute(text("ALTER TABLE Post ADD COLUMN imagem_url LONGTEXT NULL"))
            except Exception: pass

            try:
                if not column_exists(conn, "Comentario", "imagem_url"):
                    conn.execute(text("ALTER TABLE Comentario ADD COLUMN imagem_url LONGTEXT NULL"))
            except Exception: pass

            try:
                if not column_exists(conn, "Comentario", "data_criacao"):
                    conn.execute(text("ALTER TABLE Comentario ADD COLUMN data_criacao VARCHAR(19) NULL"))
                    conn.execute(text("UPDATE Comentario SET data_criacao = DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') WHERE data_criacao IS NULL"))
            except Exception: pass

            try:
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS Denuncia (
                        ID INT PRIMARY KEY,
                        categoria VARCHAR(80),
                        detalhes TEXT NULL,
                        status VARCHAR(20) DEFAULT 'pendente',
                        data_criacao VARCHAR(19) NULL,
                        fk_Post_ID INT NULL,
                        fk_Usuario_ID INT NULL
                    )
                """))
            except Exception: pass
            
            try:
                if not column_exists(conn, "Usuario", "role"):
                    conn.execute(text("ALTER TABLE Usuario ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'usuario'"))
            except Exception: pass

            try:
                if not column_exists(conn, "Usuario", "status_moderacao"):
                    conn.execute(text("ALTER TABLE Usuario ADD COLUMN status_moderacao VARCHAR(30) NOT NULL DEFAULT 'ativo'"))
            except Exception: pass
                
            try:
                if not column_exists(conn, "Usuario", "bio"):
                    conn.execute(text("ALTER TABLE Usuario ADD COLUMN bio TEXT NULL"))
            except Exception: pass
                
            try:
                if not column_exists(conn, "Usuario", "foto_url"):
                    conn.execute(text("ALTER TABLE Usuario ADD COLUMN foto_url TEXT NULL"))
            except Exception: pass
                
    except Exception as error:
        print(f"Aviso: não foi possível rodar a checagem automática de colunas: {error}")

# --- 5. AUXILIARES DE VALIDAÇÃO E SEGURANÇA ---
def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id), 
        "exp": datetime.utcnow() + timedelta(seconds=TOKEN_EXPIRE_SECONDS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

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

def data_hora_atual() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def bloquear_shadowban(usuario: Usuario):
    if usuario and usuario.status_moderacao == "shadowban":
        raise HTTPException(status_code=403, detail="Você está em shadowban e não pode publicar ou comentar")

def coletar_comentarios_com_respostas(db: Session, comentarios_ids: List[int]) -> List[int]:
    todos_ids = set(comentarios_ids)
    proximos_ids = list(comentarios_ids)

    while proximos_ids:
        filhos = db.query(Comentario.ID).filter(Comentario.comentario_pai_id.in_(proximos_ids)).all()
        proximos_ids = [c.ID for c in filhos if c.ID not in todos_ids]
        todos_ids.update(proximos_ids)

    return list(todos_ids)

def apagar_comentarios(db: Session, comentarios_ids: List[int]):
    if not comentarios_ids:
        return
    db.query(Votacao).filter(Votacao.comentario_id.in_(comentarios_ids)).delete(synchronize_session=False)
    db.query(Comentario).filter(Comentario.ID.in_(comentarios_ids)).delete(synchronize_session=False)

def apagar_post_completo(db: Session, post_id: int):
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post:
        return

    comentarios_post = db.query(Comentario.ID).filter(Comentario.post_id == post_id).all()
    apagar_comentarios(db, [c.ID for c in comentarios_post])
    db.query(Votacao).filter(Votacao.post_id == post_id).delete(synchronize_session=False)
    db.query(PostSalvo).filter(PostSalvo.post_id == post_id).delete(synchronize_session=False)
    db.query(PostUsuario).filter(PostUsuario.post_id == post_id).delete(synchronize_session=False)
    db.query(Denuncia).filter(Denuncia.post_id == post_id).update({
        Denuncia.post_id: None,
        Denuncia.status: "post_removido"
    }, synchronize_session=False)
    db.delete(post)

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
    redirect = require_authenticated_page(request)
    if redirect: return redirect
    
    try:
        user_id = get_current_user_id(request)
        usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    except:
        return RedirectResponse(url="/login")

    posts_raw = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, Post.data_criacao, Post.imagem_url, PostUsuario.usuario_id,
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

    return templates.TemplateResponse(request, "index.html", {
        "request": request, 
        "posts": posts_raw,
        "usuario_logado": usuario_logado,
        "is_admin": get_user_role(usuario_logado) == "admin"
    })

@app.get("/perfil", response_class=HTMLResponse)
async def perfil_page(request: Request, id: Optional[int] = None, db: Session = Depends(get_db)):
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    try:
        current_user_id = get_current_user_id(request)
        target_id = id if id else current_user_id
        
        usuario_perfil = db.query(Usuario).filter(Usuario.ID == target_id).first()
        usuario_logado = db.query(Usuario).filter(Usuario.ID == current_user_id).first()

        if not usuario_perfil or not usuario_logado:
            return RedirectResponse(url="/home")

        pode_editar = current_user_id == target_id

        return templates.TemplateResponse(request, "perfil.html", {
            "request": request,
            "u": usuario_perfil,
            "usuario_logado": usuario_logado,
            "pode_editar": pode_editar
        })
    except Exception as e:
        print(f"\n❌ --- ERRO CRÍTICO DE RENDERIZAÇÃO NO JINJA2: {e} ---\n")
        raise e

# --- 7. ROTAS DE API (USUÁRIOS E AUTENTICAÇÃO) ---
@app.get("/post/{post_id}", response_class=HTMLResponse)
async def post_page(post_id: int, request: Request, db: Session = Depends(get_db)):
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post or not usuario_logado:
        return RedirectResponse(url="/home")

    return templates.TemplateResponse(request, "post.html", {
        "request": request,
        "post_id": post_id,
        "usuario_logado": usuario_logado
    })

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request, db: Session = Depends(get_db)):
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario_logado or get_user_role(usuario_logado) != "admin":
        return RedirectResponse(url="/home")

    return templates.TemplateResponse(request, "admin.html", {
        "request": request,
        "usuario_logado": usuario_logado
    })

@app.get("/admin/usuarios", response_class=HTMLResponse)
async def admin_usuarios_page(request: Request, db: Session = Depends(get_db)):
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario_logado or get_user_role(usuario_logado) != "admin":
        return RedirectResponse(url="/home")

    return templates.TemplateResponse(request, "admin_usuarios.html", {
        "request": request,
        "usuario_logado": usuario_logado
    })

@app.get("/admin/denuncias", response_class=HTMLResponse)
async def admin_denuncias_page(request: Request, db: Session = Depends(get_db)):
    redirect = require_authenticated_page(request)
    if redirect: return redirect

    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario_logado or get_user_role(usuario_logado) != "admin":
        return RedirectResponse(url="/home")

    return templates.TemplateResponse(request, "admin_denuncias.html", {
        "request": request,
        "usuario_logado": usuario_logado
    })

@app.get("/auth/me")
async def obter_sessao_atual(request: Request, db: Session = Depends(get_db)):
    try:
        user_id = get_current_user_id(request)
        usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
        if not usuario: raise HTTPException(status_code=401, detail="Sessão inválida")
        return {"id": usuario.ID, "username": usuario.username, "perfil": get_user_role(usuario), "foto_url": usuario.foto_url or "", "status_moderacao": usuario.status_moderacao or "ativo"}
    except HTTPException:
        raise HTTPException(status_code=401, detail="Não autenticado")

@app.post("/login")
async def login(dados: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()
    
    if not usuario or not verify_password(dados.senha, usuario.senha):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")

    if usuario.status_moderacao in ["ban_temporario", "ban_permanente"]:
        raise HTTPException(status_code=403, detail="Usuário banido")

    token = create_access_token(usuario.ID)
    
    response = JSONResponse({
        "message": "Sucesso",
        "id": usuario.ID,
        "username": usuario.username,
        "perfil": get_user_role(usuario),
        "status_moderacao": usuario.status_moderacao or "ativo",
        "access_token": token
    })
    
    response.set_cookie(key="access_token", value=token, max_age=TOKEN_EXPIRE_SECONDS, samesite="lax")
    return response

@app.post("/usuarios")
async def cadastrar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)):
    usuario_existente = db.query(Usuario).filter(
        (Usuario.email == dados.email) | (Usuario.username == dados.username)
    ).first()
    if usuario_existente:
        raise HTTPException(status_code=400, detail="E-mail ou Usuário já cadastrado.")

    senha_criptografada = get_password_hash(dados.senha)

    novo_usuario = Usuario(
        username=dados.username,
        email=dados.email,
        senha=senha_criptografada,  
        nome=dados.nome,  
        sobrenome=dados.sobrenome,
        universidade=dados.universidade,
        altura=dados.altura,
        telefone=dados.telefone,
        dtNasc=dados.dtNasc
    )

    try:
        db.add(novo_usuario)
        db.commit()
        db.refresh(novo_usuario)
        return {"message": "Usuário criado com sucesso", "id": novo_usuario.ID}
    except Exception as database_error:
        db.rollback()
        print(f"\n❌ [ERRO CRÍTICO NO BANCO DE DADOS]: {database_error}\n")
        raise HTTPException(status_code=500, detail=f"Erro interno no banco de dados: {str(database_error)}")

@app.delete("/usuarios/{user_id}")
async def deletar_usuario(user_id: int, request: Request, db: Session = Depends(get_db)):
    current_user_id = get_current_user_id(request)
    usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario: raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    current_user = db.query(Usuario).filter(Usuario.ID == current_user_id).first()
    if not current_user or not user_can_manage(user_id, current_user): 
        raise HTTPException(status_code=403, detail="Sem permissão")
    try:
        posts_usuario = db.query(PostUsuario.post_id).filter(PostUsuario.usuario_id == user_id).all()
        for post_ref in posts_usuario:
            apagar_post_completo(db, post_ref.post_id)

        comentarios_usuario = db.query(Comentario.ID).filter(Comentario.usuario_id == user_id).all()
        comentarios_ids = coletar_comentarios_com_respostas(db, [c.ID for c in comentarios_usuario])
        apagar_comentarios(db, comentarios_ids)

        db.query(Denuncia).filter(Denuncia.usuario_id == user_id).update({
            Denuncia.usuario_id: None
        }, synchronize_session=False)
        db.query(Votacao).filter(Votacao.usuario_id == user_id).delete(synchronize_session=False)
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
    return [{"id": u.ID, "username": u.username, "nome": u.nome, "sobrenome": u.sobrenome, "universidade": u.universidade} for u in usuarios]

@app.get("/usuarios/{user_id}")
async def obtener_perfil(user_id: str, request: Request, db: Session = Depends(get_db)):
    get_current_user_id(request)
    if user_id in ["null", "undefined", ""]: raise HTTPException(status_code=400, detail="ID inválido")
    usuario = db.query(Usuario).filter(Usuario.ID == int(user_id)).first()
    if not usuario: raise HTTPException(status_code=404, detail="Não encontrado")
    return {"id": usuario.ID, "username": usuario.username, "nome": usuario.nome,"universidade": usuario.universidade, "sobrenome": usuario.sobrenome, "altura": usuario.altura, "bio": usuario.bio or "", "telefone": usuario.telefone or "", "dtNasc": usuario.dtNasc or "", "foto_url": usuario.foto_url or "", "perfil": get_user_role(usuario)}

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
    db_user.universidade = dados.universidade
    db_user.altura = dados.altura
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
            Post.ID, Post.conteudo, Post.votos, Post.data_criacao, Post.imagem_url, PostUsuario.usuario_id,
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
        "id": p.ID, "conteudo": p.conteudo, "votos": p.votos or 0, "data_criacao": p.data_criacao or "", "imagem_url": p.imagem_url or "", "autor": p.username,
        "autor_id": p.usuario_id, "usuario_id": p.usuario_id, "username": p.username,
        "foto_url": p.foto_url or "", "salvo": p.salvo_post_id is not None,
        "voto": p.voto_usuario or 0  
    } for p in posts]

@app.get("/posts/usuario/{usuario_id}")
async def listar_posts_do_usuario(usuario_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    posts = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, Post.data_criacao, Post.imagem_url, PostUsuario.usuario_id,
            Usuario.username, Usuario.foto_url, PostSalvo.post_id.label("salvo_post_id"),
            Votacao.valor.label("voto_usuario")
        )
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .outerjoin(Votacao, and_(Votacao.post_id == Post.ID, Votacao.usuario_id == user_id))
        .filter(PostUsuario.usuario_id == usuario_id)
        .order_by(Post.ID.desc())
        .all()
    )
    return [{
        "id": p.ID, "conteudo": p.conteudo, "votos": p.votos or 0, "data_criacao": p.data_criacao or "", "imagem_url": p.imagem_url or "", "autor": p.username,
        "autor_id": p.usuario_id, "usuario_id": p.usuario_id, "username": p.username,
        "foto_url": p.foto_url or "", "salvo": p.salvo_post_id is not None,
        "voto": p.voto_usuario or 0
    } for p in posts]

@app.get("/posts/saved")
async def listar_posts_salvos(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    posts = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, Post.data_criacao, Post.imagem_url, PostUsuario.usuario_id,
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
        "id": p.ID, "conteudo": p.conteudo, "votos": p.votos or 0, "data_criacao": p.data_criacao or "", "imagem_url": p.imagem_url or "", "autor": p.username,
        "autor_id": p.usuario_id, "usuario_id": p.usuario_id, "username": p.username,
        "foto_url": p.foto_url or "", "salvo": True, "voto": p.voto_usuario or 0
    } for p in posts]

@app.post("/posts")
async def criar_post_autenticado(dados: PostCreateAuth, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    bloquear_shadowban(usuario_logado)
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo and not dados.imagem_url: raise HTTPException(status_code=400, detail="Vazio")
    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1
    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, categoria=dados.categoria, votos=0, data_criacao=data_hora_atual(), imagem_url=dados.imagem_url or None)
    db.add(novo_post)
    db.flush()
    db.add(PostUsuario(usuario_id=user_id, post_id=novo_post_id))
    db.commit()
    db.refresh(novo_post)
    autor = db.query(Usuario).filter(Usuario.ID == user_id).first()
    return {"id": novo_post_id, "conteudo": novo_post.conteudo, "votos": novo_post.votos or 0, "data_criacao": novo_post.data_criacao or "", "imagem_url": novo_post.imagem_url or "", "usuario_id": user_id, "username": autor.username if autor else "usuario", "foto_url": autor.foto_url if autor else "", "salvo": False}

@app.post("/posts/criar")
async def criar_post(dados: PostCreate, request: Request, db: Session = Depends(get_db)):
    current_user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == current_user_id).first()
    bloquear_shadowban(usuario_logado)
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo: raise HTTPException(status_code=400, detail="Vazio")
    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1
    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, votos=0, data_criacao=data_hora_atual())
    db.add(novo_post)
    db.flush()
    if int(dados.usuario_id) != int(current_user_id): raise HTTPException(status_code=403, detail="Sem permissão")
    db.add(PostUsuario(usuario_id=current_user_id, post_id=novo_post_id))
    db.commit()
    return {"message": "Post criado com sucesso"}

@app.get("/posts/{post_id}")
async def obter_post(post_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = (
        db.query(
            Post.ID, Post.conteudo, Post.votos, Post.data_criacao, Post.imagem_url, PostUsuario.usuario_id,
            Usuario.username, Usuario.foto_url, PostSalvo.post_id.label("salvo_post_id"),
            Votacao.valor.label("voto_usuario")
        )
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .outerjoin(Votacao, and_(Votacao.post_id == Post.ID, Votacao.usuario_id == user_id))
        .filter(Post.ID == post_id)
        .first()
    )
    if not post: raise HTTPException(status_code=404, detail="Post não encontrado")
    return {
        "id": post.ID,
        "conteudo": post.conteudo,
        "votos": post.votos or 0,
        "data_criacao": post.data_criacao or "",
        "imagem_url": post.imagem_url or "",
        "autor": post.username,
        "autor_id": post.usuario_id,
        "usuario_id": post.usuario_id,
        "username": post.username,
        "foto_url": post.foto_url or "",
        "salvo": post.salvo_post_id is not None,
        "voto": post.voto_usuario or 0
    }

@app.post("/posts/{post_id}/denunciar")
async def denunciar_post(post_id: int, dados: DenunciaCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404, detail="Post não encontrado")

    categoria = dados.categoria.strip()
    if not categoria: raise HTTPException(status_code=400, detail="Escolha uma categoria")

    ultimo_id = db.query(func.max(Denuncia.ID)).scalar() or 0
    denuncia = Denuncia(
        ID=int(ultimo_id) + 1,
        categoria=categoria,
        detalhes=(dados.detalhes or "").strip(),
        status="pendente",
        data_criacao=data_hora_atual(),
        post_id=post_id,
        usuario_id=user_id
    )
    db.add(denuncia)
    db.commit()
    return {"message": "Denúncia enviada com sucesso"}

@app.get("/admin/dados")
async def dados_admin(request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    admin = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not admin or get_user_role(admin) != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão")

    usuarios = db.query(Usuario).order_by(Usuario.ID.asc()).all()
    denuncias = (
        db.query(
            Denuncia.ID, Denuncia.categoria, Denuncia.detalhes, Denuncia.status,
            Denuncia.data_criacao, Denuncia.post_id, Denuncia.usuario_id,
            Usuario.username, Usuario.email, Usuario.foto_url, Post.conteudo, Post.votos
        )
        .outerjoin(Usuario, Usuario.ID == Denuncia.usuario_id)
        .outerjoin(Post, Post.ID == Denuncia.post_id)
        .order_by(Denuncia.ID.desc())
        .all()
    )
    posts_recentes = (
        db.query(Post.ID, Post.conteudo, Post.data_criacao, Post.votos, Usuario.username, Usuario.email, Usuario.foto_url)
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .order_by(Post.ID.desc())
        .limit(20)
        .all()
    )

    return {
        "usuarios": [{
            "id": u.ID,
            "username": u.username,
            "email": u.email,
            "nome": u.nome,
            "sobrenome": u.sobrenome,
            "perfil": get_user_role(u),
            "status_moderacao": u.status_moderacao or "ativo",
            "foto_url": u.foto_url or ""
        } for u in usuarios],
        "denuncias": [{
            "id": d.ID,
            "categoria": d.categoria,
            "detalhes": d.detalhes or "",
            "status": d.status or "pendente",
            "data_criacao": d.data_criacao or "",
            "post_id": d.post_id,
            "usuario_id": d.usuario_id,
            "username": d.username or "usuario",
            "email": d.email or "",
            "foto_url": d.foto_url or "",
            "post_texto": (d.conteudo or "")[:220],
            "post_votos": d.votos or 0
        } for d in denuncias],
        "posts": [{
            "id": p.ID,
            "conteudo": (p.conteudo or "")[:220],
            "data_criacao": p.data_criacao or "",
            "votos": p.votos or 0,
            "username": p.username or "usuario",
            "email": p.email or "",
            "foto_url": p.foto_url or ""
        } for p in posts_recentes]
    }

@app.put("/admin/usuarios/{usuario_id}/moderacao")
async def moderar_usuario(usuario_id: int, dados: AdminUserAction, request: Request, db: Session = Depends(get_db)):
    admin_id = get_current_user_id(request)
    admin = db.query(Usuario).filter(Usuario.ID == admin_id).first()
    if not admin or get_user_role(admin) != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão")

    usuario = db.query(Usuario).filter(Usuario.ID == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if int(usuario.ID) == int(admin.ID):
        raise HTTPException(status_code=400, detail="Você não pode moderar sua própria conta")

    acoes = ["ativo", "ban_temporario", "ban_permanente", "shadowban"]
    if dados.acao not in acoes:
        raise HTTPException(status_code=400, detail="Ação inválida")

    usuario.status_moderacao = dados.acao
    db.commit()
    return {"message": "Usuário atualizado", "status_moderacao": usuario.status_moderacao}

@app.put("/admin/denuncias/{denuncia_id}/status")
async def atualizar_status_denuncia(denuncia_id: int, dados: AdminReportStatus, request: Request, db: Session = Depends(get_db)):
    admin_id = get_current_user_id(request)
    admin = db.query(Usuario).filter(Usuario.ID == admin_id).first()
    if not admin or get_user_role(admin) != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão")

    denuncia = db.query(Denuncia).filter(Denuncia.ID == denuncia_id).first()
    if not denuncia:
        raise HTTPException(status_code=404, detail="Denúncia não encontrada")

    status_validos = ["pendente", "analisada", "post_removido"]
    if dados.status not in status_validos:
        raise HTTPException(status_code=400, detail="Status inválido")

    denuncia.status = dados.status
    db.commit()
    return {"message": "Denúncia atualizada", "status": denuncia.status}

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

@app.get("/posts/{post_id}/comentarios")
async def listar_comentarios(post_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    comentarios = (
        db.query(
            Comentario.ID, Comentario.texto, Comentario.votos, Comentario.imagem_url, Comentario.data_criacao, Comentario.post_id,
            Comentario.usuario_id, Comentario.comentario_pai_id,
            Usuario.username, Usuario.foto_url, Votacao.valor.label("voto_usuario")
        )
        .join(Usuario, Usuario.ID == Comentario.usuario_id)
        .outerjoin(Votacao, and_(Votacao.comentario_id == Comentario.ID, Votacao.usuario_id == user_id))
        .filter(Comentario.post_id == post_id)
        .order_by(Comentario.ID.asc())
        .all()
    )
    return [{
        "id": c.ID,
        "texto": c.texto,
        "votos": c.votos or 0,
        "imagem_url": c.imagem_url or "",
        "data_criacao": c.data_criacao or "",
        "post_id": c.post_id,
        "usuario_id": c.usuario_id,
        "comentario_pai_id": c.comentario_pai_id,
        "username": c.username,
        "foto_url": c.foto_url or "",
        "voto": c.voto_usuario or 0
    } for c in comentarios]

@app.post("/posts/{post_id}/comentarios")
async def criar_comentario(post_id: int, dados: ComentarioCreate, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    usuario_logado = db.query(Usuario).filter(Usuario.ID == user_id).first()
    bloquear_shadowban(usuario_logado)
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404, detail="Post não encontrado")

    texto_limpo = dados.texto.strip()
    if not texto_limpo and not dados.imagem_url: raise HTTPException(status_code=400, detail="Comentário vazio")

    comentario_pai_id = dados.comentario_pai_id
    if comentario_pai_id:
        comentario_pai = db.query(Comentario).filter(Comentario.ID == comentario_pai_id, Comentario.post_id == post_id).first()
        if not comentario_pai: raise HTTPException(status_code=404, detail="Comentário pai não encontrado")

    ultimo_id = db.query(func.max(Comentario.ID)).scalar() or 0
    novo_comentario = Comentario(
        ID=int(ultimo_id) + 1,
        texto=texto_limpo,
        votos=0,
        post_id=post_id,
        usuario_id=user_id,
        comentario_pai_id=comentario_pai_id,
        imagem_url=dados.imagem_url or None,
        data_criacao=data_hora_atual()
    )
    db.add(novo_comentario)
    db.commit()
    autor = db.query(Usuario).filter(Usuario.ID == user_id).first()
    return {
        "id": novo_comentario.ID,
        "texto": novo_comentario.texto,
        "votos": 0,
        "imagem_url": novo_comentario.imagem_url or "",
        "data_criacao": novo_comentario.data_criacao or "",
        "post_id": post_id,
        "usuario_id": user_id,
        "comentario_pai_id": comentario_pai_id,
        "username": autor.username if autor else "usuario",
        "foto_url": autor.foto_url if autor else "",
        "voto": 0
    }

@app.put("/comentarios/{comentario_id}/votar")
async def votar_comentario(comentario_id: int, tipo: str, request: Request, db: Session = Depends(get_db)):
    user_id = get_current_user_id(request)
    comentario = db.query(Comentario).filter(Comentario.ID == comentario_id).first()
    if not comentario: raise HTTPException(status_code=404, detail="Comentário não encontrado")

    votacao = db.query(Votacao).filter(Votacao.comentario_id == comentario_id, Votacao.usuario_id == user_id).first()
    voto_atual = votacao.valor if votacao else 0

    if tipo == "up":
        if voto_atual == 1: pass
        elif voto_atual == -1:
            comentario.votos = (comentario.votos or 0) + 2
            votacao.valor = 1
        else:
            comentario.votos = (comentario.votos or 0) + 1
            if votacao: votacao.valor = 1
            else:
                ultimo_id = db.query(func.max(Votacao.ID)).scalar() or 0
                db.add(Votacao(ID=int(ultimo_id) + 1, tipo="comentario", comentario_id=comentario_id, usuario_id=user_id, valor=1))

    elif tipo == "down":
        if voto_atual == -1: pass
        elif voto_atual == 1:
            comentario.votos = (comentario.votos or 0) - 2
            votacao.valor = -1
        else:
            comentario.votos = (comentario.votos or 0) - 1
            if votacao: votacao.valor = -1
            else:
                ultimo_id = db.query(func.max(Votacao.ID)).scalar() or 0
                db.add(Votacao(ID=int(ultimo_id) + 1, tipo="comentario", comentario_id=comentario_id, usuario_id=user_id, valor=-1))

    elif tipo == "cancel":
        if voto_atual == 1:
            comentario.votos = (comentario.votos or 0) - 1
            votacao.valor = 0
        elif voto_atual == -1:
            comentario.votos = (comentario.votos or 0) + 1
            votacao.valor = 0

    db.commit()
    return {"votos": comentario.votos}

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
    is_owner = current_user and int(relacionamento.usuario_id) == int(user_id)
    is_admin = current_user and get_user_role(current_user) == "admin"
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Sem permissão")

    apagar_post_completo(db, post_id)
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
    
    if int(relacionamento.usuario_id) != int(user_id):
        raise HTTPException(status_code=403, detail="Sem permissão")
        
    post.conteudo = conteudo_limpo
    db.commit()
    return {"message": "Atualizado com sucesso", "conteudo": post.conteudo}
