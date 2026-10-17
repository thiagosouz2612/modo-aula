// ------------------------------------------------------------------
// Ligação com a plataforma do curso: o professor entra com o mesmo
// login do site e traz as aulas do modo aula (textos, destaques,
// comentários dos slides) e as apresentações em PDF.
// ------------------------------------------------------------------
use crate::biblia::http;
use crate::dados::{valid_id, write_atomic, Config, Pasta};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

fn cookies_from(res: &reqwest::Response) -> Option<String> {
    let list: Vec<String> = res
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .filter_map(|v| v.split(';').next())
        .map(|s| s.trim().to_string())
        .filter(|s| s.contains('=') && !s.ends_with('='))
        .collect();
    (!list.is_empty()).then(|| list.join("; "))
}

async fn error_of(res: reqwest::Response) -> String {
    let status = res.status().as_u16();
    let msg = res.json::<Value>().await.ok().and_then(|v| v.get("error").and_then(|e| e.as_str()).map(String::from));
    match (status, msg) {
        (_, Some(m)) if m != "offline" => m,
        (401, _) => "Sessão expirada. Entre de novo com o seu login.".into(),
        (503, _) => "A plataforma está sem banco de dados no momento.".into(),
        (s, _) => format!("A plataforma respondeu {s}."),
    }
}

fn offline<E>(_: E) -> String {
    "Não foi possível falar com a plataforma. Confira a internet e o endereço do site em Ajustes.".into()
}

#[tauri::command]
pub async fn entrar(usuario: String, senha: String, cfg: State<'_, Config>) -> Result<String, String> {
    let site = cfg.get().site;
    let res = http()
        .post(format!("{site}/api/auth/login"))
        .json(&json!({ "role": "professor", "user": usuario.trim(), "password": senha }))
        .send()
        .await
        .map_err(offline)?;
    if !res.status().is_success() {
        return Err(error_of(res).await);
    }
    let cookie = cookies_from(&res).ok_or("A plataforma não abriu a sessão.")?;
    let body: Value = res.json().await.unwrap_or(Value::Null);
    let nome = body
        .pointer("/staff/name")
        .or_else(|| body.pointer("/staff/nome"))
        .and_then(|v| v.as_str())
        .unwrap_or(usuario.trim())
        .to_string();
    cfg.update(|d| {
        d.cookie = Some(cookie);
        d.usuario = Some(usuario.trim().to_string());
        d.nome = Some(nome.clone());
    })?;
    Ok(nome)
}

#[tauri::command]
pub fn sair(cfg: State<Config>) -> Result<(), String> {
    cfg.update(|d| {
        d.cookie = None;
        d.nome = None;
    })
}

fn session(cfg: &Config) -> Result<(String, String), String> {
    let d = cfg.get();
    let c = d.cookie.ok_or("Entre com o seu login da plataforma primeiro.")?;
    Ok((d.site, c))
}

/// aulas e pastas do modo aula guardadas na plataforma (JSON igual ao do site)
#[tauri::command]
pub async fn baixar_aulas(cfg: State<'_, Config>) -> Result<String, String> {
    let (site, cookie) = session(&cfg)?;
    let res = http()
        .get(format!("{site}/api/biblia-aulas"))
        .header(reqwest::header::COOKIE, cookie)
        .send()
        .await
        .map_err(offline)?;
    if res.status().as_u16() == 401 {
        let _ = cfg.update(|d| d.cookie = None);
    }
    if !res.status().is_success() {
        return Err(error_of(res).await);
    }
    res.text().await.map_err(offline)
}

#[derive(Deserialize)]
struct Meta {
    partes: u32,
}

/// baixa uma apresentação (PDF) da plataforma para o computador
#[tauri::command]
pub async fn baixar_arquivo(id: String, cfg: State<'_, Config>, pasta: State<'_, Pasta>) -> Result<u64, String> {
    if !valid_id(&id) {
        return Err("Arquivo inválido.".into());
    }
    let (site, cookie) = session(&cfg)?;
    let res = http()
        .get(format!("{site}/api/arquivos/{id}"))
        .header(reqwest::header::COOKIE, &cookie)
        .send()
        .await
        .map_err(offline)?;
    if !res.status().is_success() {
        return Err(error_of(res).await);
    }
    let meta: Meta = res.json().await.map_err(|_| "Resposta inválida da plataforma.".to_string())?;
    let mut all = Vec::new();
    for i in 0..meta.partes {
        let r = http()
            .get(format!("{site}/api/arquivos/{id}/{i}"))
            .header(reqwest::header::COOKIE, &cookie)
            .send()
            .await
            .map_err(offline)?;
        if !r.status().is_success() {
            return Err(error_of(r).await);
        }
        all.extend_from_slice(&r.bytes().await.map_err(offline)?);
    }
    write_atomic(&pasta.0.join("arquivos").join(&id), &all)?;
    Ok(all.len() as u64)
}
