import pymysql

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "SocialBit",
    "cursorclass": pymysql.cursors.DictCursor # Adicionado para facilitar a leitura dos dados
}

# Função para obter conexão com MySQL
def get_db():
    return pymysql.connect(**DB_CONFIG)

# --- NOVA FUNÇÃO: Atualizar dados do usuário (CRUD - Update) ---
def atualizar_usuario_db(id_usuario, nome, sobrenome, bio):
    conexao = get_db()
    try:
        with conexao.cursor() as cursor:
            # SQL para atualizar os campos específicos
            sql = "UPDATE usuario SET nome = %s, sobrenome = %s, bio = %s WHERE id = %s"
            cursor.execute(sql, (nome, sobrenome, bio, id_usuario))
            conexao.commit()
            return True
    except Exception as e:
        print(f"Erro ao atualizar no BD: {e}")
        return False
    finally:
        conexao.close()

# --- NOVA FUNÇÃO: Buscar dados do usuário (CRUD - Read) ---
# Você vai precisar disso para preencher os campos do perfil ao carregar a página
def buscar_usuario_por_id(id_usuario):
    conexao = get_db()
    try:
        with conexao.cursor() as cursor:
            sql = "SELECT id, nome, sobrenome, bio, username FROM usuario WHERE id = %s"
            cursor.execute(sql, (id_usuario,))
            return cursor.fetchone() # Retorna um dicionário com os dados
    except Exception as e:
        print(f"Erro ao buscar usuário: {e}")
        return None
    finally:
        conexao.close()