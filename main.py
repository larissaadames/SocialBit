from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey, text, func, and_
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from jose import jwt, JWTError
from urllib.parse import quote_plus
from pathlib import Path
import hashlib
import re

# Configuracao fixa (sem variaveis de ambiente)
DB_USER = "root"
DB_PASSWORD = "root"
DB_NAME = "socialbit"
DB_HOST = "localhost"

SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:root@localhost/socialbit"

# SQLALCHEMY_DATABASE_URL = (
#     f"mysql+pymysql://{DB_USER}:{quote_plus(DB_PASSWORD)}@{DB_HOST}/{DB_NAME}"
# )

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 2. MODELOS DO BANCO (USUÁRIOS E POSTS) ---

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
    foto_url = Column(Text, nullable=True) # Para salvar Base64

class Post(Base):
    __tablename__ = "Post"
    ID = Column(Integer, primary_key=True, index=True)
    # Schema legado usa coluna texto para conteudo do post.
    conteudo = Column("texto", Text)
    # Schema legado usa coluna voto (singular).
    votos = Column("voto", Integer, default=0)


class PostUsuario(Base):
    __tablename__ = "Post_Ususario"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True)


class PostSalvo(Base):
    __tablename__ = "PostSalvo"
    usuario_id = Column("fk_Usuario_ID", Integer, ForeignKey("Usuario.ID"), primary_key=True)
    post_id = Column("fk_Post_ID", Integer, ForeignKey("Post.ID"), primary_key=True)


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

# --- 4. INICIALIZAÇÃO E MIDDLEWARES ---

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montagem da pasta de arquivos estáticos
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
app.mount("/public", StaticFiles(directory=str(PUBLIC_DIR)), name="public")
templates = Jinja2Templates(directory=str(PUBLIC_DIR))


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
                SELECT 1
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = :table_name
                  AND COLUMN_NAME = :column_name
                LIMIT 1
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).first()
        return row is not None

    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE Usuario MODIFY COLUMN senha VARCHAR(100)"))

            required_usuario_columns = {
                "role": "ALTER TABLE Usuario ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'usuario'",
                "bio": "ALTER TABLE Usuario ADD COLUMN bio TEXT NULL",
                "foto_url": "ALTER TABLE Usuario ADD COLUMN foto_url TEXT NULL",
            }

            for column_name, ddl in required_usuario_columns.items():
                exists = conn.execute(
                    text(
                        """
                        SELECT 1
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = 'Usuario'
                          AND COLUMN_NAME = :column_name
                        LIMIT 1
                        """
                    ),
                    {"column_name": column_name},
                ).first()

                if not exists:
                    conn.execute(text(ddl))

            if column_exists(conn, "Usuario", "role"):
                conn.execute(text("UPDATE Usuario SET role = 'usuario' WHERE role IS NULL OR role = ''"))

            # Compatibilidade com schema de Post legado (texto/voto)
            if not column_exists(conn, "Post", "texto"):
                conn.execute(text("ALTER TABLE Post ADD COLUMN texto VARCHAR(500) NULL"))
                if column_exists(conn, "Post", "conteudo"):
                    conn.execute(text("UPDATE Post SET texto = conteudo WHERE texto IS NULL"))

            if not column_exists(conn, "Post", "voto"):
                conn.execute(text("ALTER TABLE Post ADD COLUMN voto INT NULL DEFAULT 0"))
                if column_exists(conn, "Post", "votos"):
                    conn.execute(text("UPDATE Post SET voto = votos WHERE voto IS NULL"))
    except Exception as error:
        # Se a tabela/coluna ainda nao existir em algum setup, mantemos o app de pe.
        print(f"Aviso: nao foi possivel ajustar schema do banco: {error}")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- 5. ROTAS DE AUTENTICAÇÃO ---

# JWT/Auth
SECRET_KEY = "troque-esta-chave"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 24
PHONE_REGEX = re.compile(r"^\(\d{2}\)\s\d{4,5}-\d{4}$")
PHONE_API_KEY = ""


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def is_probably_hash(stored_password: str) -> bool:
    if not stored_password or len(stored_password) != 64:
        return False
    return all(char in "0123456789abcdef" for char in stored_password.lower())


def verify_password(plain_password: str, stored_password: str) -> bool:
    if is_probably_hash(stored_password):
        return get_password_hash(plain_password) == stored_password
    return plain_password == stored_password

def validate_phone_or_raise(phone: str):
    # Se o campo estiver vazio, não faz nada (opcional)
    if not phone or not phone.strip():
        return 
    
    # Valida apenas o formato (00) 00000-0000
    if not PHONE_REGEX.fullmatch(phone.strip()):
        raise HTTPException(
            status_code=400,
            detail="Telefone inválido. Use o formato (00) 00000-0000",
        )

def get_current_user_id(
    request: Request,
    authorization: str = Header(default=None),
) -> int:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    else:
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=401, detail="Token ausente")

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido")


def require_authenticated_page(request: Request) -> Optional[RedirectResponse]:
    token = request.cookies.get("access_token")
    if not token:
        return RedirectResponse(url="/login")
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return RedirectResponse(url="/login")
    return None


def normalize_role(value: Optional[str]) -> str:
    role = (value or "").strip().lower()
    if role in {"admin", "administrador"}:
        return "admin"
    return "usuario"


def get_user_role(usuario: Usuario) -> str:
    return normalize_role(usuario.role)


def get_current_user(db: Session, user_id: int) -> Usuario:
    usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Sessao invalida")
    return usuario


def user_can_manage(target_user_id: int, current_user: Usuario) -> bool:
    return int(current_user.ID) == int(target_user_id) or get_user_role(current_user) == "admin"


# 5. Rotas
@app.get("/")
async def root():
    return RedirectResponse(url="/login")


@app.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse(request, "Login/login.html", {"request": request})


@app.get("/cadastro")
async def cadastro_page(request: Request):
    return templates.TemplateResponse(request, "Cadastro/cadastro.html", {"request": request})


@app.get("/home")
async def home_page(request: Request):
    redirect = require_authenticated_page(request)
    if redirect:
        return redirect
    return templates.TemplateResponse(request, "home/index.html", {"request": request})


@app.get("/perfil")
async def perfil_page(request: Request):
    redirect = require_authenticated_page(request)
    if redirect:
        return redirect
    return templates.TemplateResponse(request, "perfil/perfil.html", {"request": request})


@app.get("/auth/me")
async def obter_sessao_atual(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    usuario = get_current_user(db, user_id)

    return {
        "id": usuario.ID,
        "username": usuario.username,
        "perfil": get_user_role(usuario),
        "foto_url": usuario.foto_url or "",
    }


@app.post("/login")
async def login(dados: LoginRequest, db: Session = Depends(get_db)):
    print("\nNOVA TENTATIVA DE LOGIN")
    print(f"1. Email digitado no site: '{dados.email}'")
    print(f"2. Senha digitada no site: '{dados.senha}'")
    
    usuario = db.query(Usuario).filter(Usuario.email == dados.email).first()
    if not usuario or not verify_password(dados.senha, usuario.senha):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")

    # Migra silenciosamente usuarios legados que ainda estao com senha em texto puro.
    if not is_probably_hash(usuario.senha):
        usuario.senha = get_password_hash(dados.senha)
        db.commit()

    token = create_access_token(usuario.ID)
    response = JSONResponse({
        "message": "Sucesso",
        "id": usuario.ID,
        "username": usuario.username,
        "perfil": get_user_role(usuario),
        "foto_url": usuario.foto_url or "",
        "access_token": token,
        "token_type": "bearer",
    })
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
    )
    return response


@app.post("/usuarios")
async def cadastrar_usuario(usuario: CadastroUsuario, db: Session = Depends(get_db)):
    username_limpo = usuario.username.strip()
    if not username_limpo:
        raise HTTPException(status_code=400, detail="Username inválido")

    db_user = db.query(Usuario).filter(Usuario.email == usuario.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    db_username = (
        db.query(Usuario)
        .filter(func.lower(Usuario.username) == username_limpo.lower())
        .first()
    )
    if db_username:
        raise HTTPException(status_code=400, detail="Username já cadastrado")

    validate_phone_or_raise(usuario.telefone)

    senha_criptografada = get_password_hash(usuario.senha)

    novo_usuario = Usuario(
        username=username_limpo, dtNasc=usuario.dtNasc, senha=senha_criptografada,
        email=usuario.email, nome=usuario.nome, sobrenome=usuario.sobrenome,
        telefone=usuario.telefone, role="usuario", bio="", foto_url=""
    )
    db.add(novo_usuario)
    db.commit()
    return {"message": "Usuário cadastrado com sucesso"}

@app.delete("/usuarios/{user_id}")
async def deletar_usuario(
    user_id: int,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    
    usuario = db.query(Usuario).filter(Usuario.ID == user_id).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario não encontrado")

    current_user = get_current_user(db, current_user_id)
    if not user_can_manage(user_id, current_user):
        raise HTTPException(status_code=403, detail="Sem permissão para excluir este usuário")
    
    try:
        
        db.query(PostSalvo).filter(PostSalvo.usuario_id == user_id).delete()
        db.query(PostUsuario).filter(PostUsuario.usuario_id == user_id).delete()
        
        db.delete(usuario)
        db.commit()
        return {"message": "Conta excluída com sucesso"}
    except Exception as e:
        db.rollback()
        print(f"Erro ao eliminar: {e}")
        raise HTTPException(status_code=500, detail="Erro interno no servidor")

# --- 6. ROTAS DE PERFIL E BUSCA ---

@app.get("/usuarios/busca")
async def buscar_usuarios(
    username: str,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    termo = username.strip()
    if not termo: return []
    usuarios = db.query(Usuario).filter(Usuario.username.like(f"%{termo}%")).limit(10).all()
    return [{"id": u.ID, "username": u.username, "nome": u.nome, "sobrenome": u.sobrenome} for u in usuarios]

@app.get("/usuarios/{user_id}")
async def obter_perfil(
    user_id: str,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    # Tratamento para evitar erro quando o localStorage retorna "null" no JS
    if user_id in ["null", "undefined", ""]:
        raise HTTPException(status_code=400, detail="ID de usuário inválido")
    
    usuario = db.query(Usuario).filter(Usuario.ID == int(user_id)).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    return {
        "id": usuario.ID, "username": usuario.username, "nome": usuario.nome,
        "sobrenome": usuario.sobrenome, "bio": usuario.bio or "",
        "telefone": usuario.telefone or "", "dtNasc": usuario.dtNasc or "",
        "foto_url": usuario.foto_url or "",
        "perfil": get_user_role(usuario),
    }

@app.put("/usuarios/update")
async def atualizar_perfil(
    dados: UserUpdate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    db_user = db.query(Usuario).filter(Usuario.ID == dados.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    current_user = get_current_user(db, current_user_id)
    if not user_can_manage(dados.id, current_user):
        raise HTTPException(status_code=403, detail="Sem permissão para atualizar este usuário")

    # 1. Validação de Telefone (Já existente no seu código)
    validate_phone_or_raise(dados.telefone)
    
    # 2. Validação de Nome e Sobrenome
    if len(dados.nome.strip()) < 2 or len(dados.sobrenome.strip()) < 2:
        raise HTTPException(status_code=400, detail="Nome e sobrenome muito curtos.")

    # 3. Validação de Idade (16 anos)
    try:
        data_nasc = datetime.strptime(dados.dtNasc, "%Y-%m-%d")
        idade = (datetime.now() - data_nasc).days // 365
        if idade < 16:
            raise HTTPException(status_code=400, detail="Idade mínima de 16 anos não atingida.")
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de data inválido.")

    # Se passar em tudo, atualiza o banco
    db_user.nome = dados.nome
    db_user.sobrenome = dados.sobrenome
    db_user.bio = dados.bio
    db_user.telefone = dados.telefone
    db_user.dtNasc = dados.dtNasc
    if dados.foto_url:
        db_user.foto_url = dados.foto_url
    
    db.commit()
    return {"message": "Perfil atualizado com sucesso"}

# --- 7. ROTAS DE POSTS E VOTOS ---

@app.get("/posts")
async def listar_posts(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    posts = (
        db.query(
            Post.ID,
            Post.conteudo,
            Post.votos,
            PostUsuario.usuario_id,
            Usuario.username,
            Usuario.foto_url,
            PostSalvo.post_id.label("salvo_post_id"),
        )
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .outerjoin(
            PostSalvo,
            and_(
                PostSalvo.post_id == Post.ID,
                PostSalvo.usuario_id == user_id,
            ),
        )
        .order_by(Post.ID.desc())
        .all()
    )

    return [{
        "id": post.ID,
        "conteudo": post.conteudo,
        "votos": post.votos or 0,
        "autor": post.username,
        "autor_id": post.usuario_id,
        "usuario_id": post.usuario_id,
        "username": post.username,
        "foto_url": post.foto_url or "",
        "salvo": post.salvo_post_id is not None,
    } for post in posts]


@app.get("/posts/saved")
async def listar_posts_salvos(
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    posts = (
        db.query(
            Post.ID,
            Post.conteudo,
            Post.votos,
            PostUsuario.usuario_id,
            Usuario.username,
            Usuario.foto_url,
        )
        .join(PostSalvo, and_(PostSalvo.post_id == Post.ID, PostSalvo.usuario_id == user_id))
        .join(PostUsuario, PostUsuario.post_id == Post.ID)
        .join(Usuario, Usuario.ID == PostUsuario.usuario_id)
        .filter(PostSalvo.usuario_id == user_id)
        .order_by(Post.ID.desc())
        .all()
    )

    return [{
        "id": post.ID,
        "conteudo": post.conteudo,
        "votos": post.votos or 0,
        "autor": post.username,
        "autor_id": post.usuario_id,
        "usuario_id": post.usuario_id,
        "username": post.username,
        "foto_url": post.foto_url or "",
        "salvo": True,
    } for post in posts]


@app.post("/posts")
async def criar_post_autenticado(
    dados: PostCreateAuth,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo:
        raise HTTPException(status_code=400, detail="Conteudo do post nao pode ser vazio")

    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1

    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, votos=0)
    db.add(novo_post)
    db.flush()

    relacionamento = PostUsuario(usuario_id=user_id, post_id=novo_post_id)
    db.add(relacionamento)
    db.commit()
    db.refresh(novo_post)

    autor = db.query(Usuario).filter(Usuario.ID == user_id).first()
    return {
        "id": novo_post_id,
        "conteudo": novo_post.conteudo,
        "votos": novo_post.votos or 0,
        "usuario_id": user_id,
        "username": autor.username if autor else "usuario",
        "foto_url": autor.foto_url if autor else "",
        "salvo": False,
    }

@app.post("/posts/criar")
async def criar_post(
    dados: PostCreate,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo:
        raise HTTPException(status_code=400, detail="Conteudo do post nao pode ser vazio")

    ultimo_id = db.query(func.max(Post.ID)).scalar() or 0
    novo_post_id = int(ultimo_id) + 1

    novo_post = Post(ID=novo_post_id, conteudo=conteudo_limpo, votos=0)
    db.add(novo_post)
    db.flush()

    if int(dados.usuario_id) != int(current_user_id):
        raise HTTPException(status_code=403, detail="Sem permissão para criar post com outro usuário")

    relacionamento = PostUsuario(usuario_id=current_user_id, post_id=novo_post_id)
    db.add(relacionamento)
    db.commit()
    return {"message": "Post criado com sucesso"}

@app.put("/posts/{post_id}/votar")
async def votar(
    post_id: int,
    tipo: str,
    current_user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post: raise HTTPException(status_code=404)
    if tipo == "up": post.votos = (post.votos or 0) + 1
    elif tipo == "down": post.votos = (post.votos or 0) - 1
    db.commit()
    return {"votos": post.votos}


@app.post("/posts/{post_id}/save")
async def salvar_post(
    post_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post não encontrado")

    ja_salvo = (
        db.query(PostSalvo)
        .filter(PostSalvo.post_id == post_id, PostSalvo.usuario_id == user_id)
        .first()
    )

    if ja_salvo:
        return {"message": "Post já está salvo"}

    salvo = PostSalvo(usuario_id=user_id, post_id=post_id)
    db.add(salvo)
    db.commit()
    return {"message": "Post salvo com sucesso"}


@app.delete("/posts/{post_id}/save")
async def remover_post_salvo(
    post_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post não encontrado")

    salvo = (
        db.query(PostSalvo)
        .filter(PostSalvo.post_id == post_id, PostSalvo.usuario_id == user_id)
        .first()
    )
    if not salvo:
        return {"message": "Post não estava salvo"}

    db.delete(salvo)
    db.commit()
    return {"message": "Post removido dos salvos"}


@app.delete("/posts/{post_id}")
async def remover_post(
    post_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post não encontrado")

    relacionamento = db.query(PostUsuario).filter(PostUsuario.post_id == post_id).first()
    if not relacionamento:
        raise HTTPException(status_code=404, detail="Autor do post não encontrado")

    current_user = get_current_user(db, user_id)
    if int(relacionamento.usuario_id) != int(user_id) and get_user_role(current_user) != "admin":
        raise HTTPException(status_code=403, detail="Sem permissão para remover este post")

    db.query(PostSalvo).filter(PostSalvo.post_id == post_id).delete(synchronize_session=False)
    db.query(PostUsuario).filter(PostUsuario.post_id == post_id).delete(synchronize_session=False)
    db.delete(post)
    db.commit()
    return {"message": "Post removido com sucesso"}


@app.put("/posts/{post_id}")
async def atualizar_post(
    post_id: int,
    dados: PostCreateAuth,
    user_id: int = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    conteudo_limpo = dados.conteudo.strip()
    if not conteudo_limpo:
        raise HTTPException(status_code=400, detail="Conteudo do post nao pode ser vazio")

    post = db.query(Post).filter(Post.ID == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post nao encontrado")

    relacionamento = db.query(PostUsuario).filter(PostUsuario.post_id == post_id).first()
    if not relacionamento:
        raise HTTPException(status_code=404, detail="Autor do post nao encontrado")

    current_user = get_current_user(db, user_id)
    if int(relacionamento.usuario_id) != int(user_id) and get_user_role(current_user) != "admin":
        raise HTTPException(status_code=403, detail="Sem permissao para editar este post")

    post.conteudo = conteudo_limpo
    db.commit()
    return {"message": "Post atualizado com sucesso", "conteudo": post.conteudo}