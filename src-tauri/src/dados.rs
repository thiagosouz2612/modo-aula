// ------------------------------------------------------------------
// Dados do Modo Aula no computador (pasta do aplicativo):
//   aulas.json       aulas, pastas e preferências (o app guarda tudo de uma vez)
//   arquivos/<id>    apresentações em PDF
//   config.json      endereço da plataforma e sessão do professor
// ------------------------------------------------------------------
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

pub struct Pasta(pub PathBuf);

pub const SITE_PADRAO: &str = "https://teologiabethel.com.br";

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct ConfigData {
    #[serde(default)]
    pub site: String,
    #[serde(default)]
    pub cookie: Option<String>,
    #[serde(default)]
    pub usuario: Option<String>,
    #[serde(default)]
    pub nome: Option<String>,
}

pub struct Config {
    pub data: Mutex<ConfigData>,
    path: PathBuf,
}

impl Config {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("config.json");
        let mut data: ConfigData = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        if data.site.trim().is_empty() {
            data.site = SITE_PADRAO.into();
        }
        Config { data: Mutex::new(data), path }
    }
    pub fn get(&self) -> ConfigData {
        self.data.lock().unwrap().clone()
    }
    pub fn update(&self, f: impl FnOnce(&mut ConfigData)) -> Result<(), String> {
        let mut d = self.data.lock().unwrap();
        f(&mut d);
        let bytes = serde_json::to_vec_pretty(&*d).map_err(|e| e.to_string())?;
        write_atomic(&self.path, &bytes)
    }
}

/// grava num arquivo temporário e troca de nome: se o computador desligar no meio, o arquivo antigo fica inteiro
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("Não foi possível gravar: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Não foi possível gravar: {e}"))
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 96 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn raw_body(req: &Request) -> Result<Vec<u8>, String> {
    match req.body() {
        InvokeBody::Raw(b) => Ok(b.clone()),
        _ => Err("Envio inválido.".into()),
    }
}

fn header(req: &Request, name: &str) -> Result<String, String> {
    req.headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Falta o cabeçalho {name}."))
}

// ---------------- aulas ----------------

#[tauri::command]
pub fn ler_dados(pasta: State<Pasta>) -> String {
    std::fs::read_to_string(pasta.0.join("aulas.json")).unwrap_or_else(|_| "null".into())
}

#[tauri::command]
pub fn salvar_dados(pasta: State<Pasta>, json: String) -> Result<(), String> {
    // confere que é JSON antes de trocar o arquivo
    serde_json::from_str::<serde_json::Value>(&json).map_err(|_| "Dados inválidos.".to_string())?;
    let path = pasta.0.join("aulas.json");
    // cópia de segurança do anterior
    if path.exists() {
        let _ = std::fs::copy(&path, pasta.0.join("aulas.anterior.json"));
    }
    write_atomic(&path, json.as_bytes())
}

// ---------------- arquivos (PDF) ----------------

#[tauri::command]
pub fn salvar_arquivo(pasta: State<Pasta>, request: Request) -> Result<u64, String> {
    let id = header(&request, "x-id")?;
    if !valid_id(&id) {
        return Err("Nome de arquivo inválido.".into());
    }
    let bytes = raw_body(&request)?;
    write_atomic(&pasta.0.join("arquivos").join(&id), &bytes)?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
pub fn ler_arquivo(pasta: State<Pasta>, id: String) -> Result<Response, String> {
    if !valid_id(&id) {
        return Err("Nome de arquivo inválido.".into());
    }
    std::fs::read(pasta.0.join("arquivos").join(&id))
        .map(Response::new)
        .map_err(|_| "Arquivo não encontrado neste computador.".into())
}

#[tauri::command]
pub fn tem_arquivo(pasta: State<Pasta>, id: String) -> bool {
    valid_id(&id) && pasta.0.join("arquivos").join(&id).exists()
}

#[tauri::command]
pub fn apagar_arquivo(pasta: State<Pasta>, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Nome de arquivo inválido.".into());
    }
    let _ = std::fs::remove_file(pasta.0.join("arquivos").join(&id));
    Ok(())
}

// ---------------- configuração ----------------

#[derive(Serialize)]
pub struct ConfigPublica {
    site: String,
    usuario: Option<String>,
    nome: Option<String>,
    conectado: bool,
    pasta: String,
}

#[tauri::command]
pub fn config(cfg: State<Config>, pasta: State<Pasta>) -> ConfigPublica {
    let d = cfg.get();
    ConfigPublica {
        site: d.site,
        usuario: d.usuario,
        nome: d.nome,
        conectado: d.cookie.is_some(),
        pasta: pasta.0.display().to_string(),
    }
}

#[tauri::command]
pub fn definir_site(cfg: State<Config>, site: String) -> Result<String, String> {
    let mut s = site.trim().trim_end_matches('/').to_string();
    if s.is_empty() {
        s = SITE_PADRAO.into();
    }
    if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("https://{s}");
    }
    let changed = cfg.get().site != s;
    cfg.update(|d| {
        d.site = s.clone();
        // outro site: a sessão antiga não vale lá
        if changed {
            d.cookie = None;
            d.nome = None;
        }
    })?;
    Ok(s)
}

// ---------------- roteiros (esboços) ----------------
// roteiros/indice.json (lista e pastas) e roteiros/<id>.html (texto de cada um)

fn roteiro_path(pasta: &Pasta, nome: &str) -> Result<PathBuf, String> {
    if nome != "indice.json" && !(nome.ends_with(".html") && valid_id(nome.trim_end_matches(".html"))) {
        return Err("Nome inválido.".into());
    }
    let dir = pasta.0.join("roteiros");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(nome))
}

#[tauri::command]
pub fn roteiro_ler(pasta: State<Pasta>, nome: String) -> Result<Option<String>, String> {
    Ok(std::fs::read_to_string(roteiro_path(&pasta, &nome)?).ok())
}

#[tauri::command]
pub fn roteiro_salvar(pasta: State<Pasta>, nome: String, texto: String) -> Result<(), String> {
    write_atomic(&roteiro_path(&pasta, &nome)?, texto.as_bytes())
}

#[tauri::command]
pub fn roteiro_apagar(pasta: State<Pasta>, nome: String) -> Result<(), String> {
    let _ = std::fs::remove_file(roteiro_path(&pasta, &nome)?);
    Ok(())
}

// ---------------- cópia de segurança em arquivo ----------------

/// grava a cópia na pasta Documentos e devolve o caminho
#[tauri::command]
pub fn salvar_copia(app: tauri::AppHandle, conteudo: String, nome: String) -> Result<String, String> {
    use tauri::Manager;
    let nome: String = nome.chars().filter(|c| c.is_alphanumeric() || " -_.".contains(*c)).collect();
    // Documentos\Modo Aula (se não houver pasta Documentos, na pasta pessoal ou na do aplicativo)
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir().map(|h| h.join("Documents")))
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    let dir = base.join("Modo Aula");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Não foi possível criar a pasta: {e}"))?;
    let path = dir.join(if nome.ends_with(".json") { nome } else { format!("{nome}.json") });
    std::fs::write(&path, conteudo).map_err(|e| format!("Não foi possível gravar: {e}"))?;
    Ok(path.display().to_string())
}
