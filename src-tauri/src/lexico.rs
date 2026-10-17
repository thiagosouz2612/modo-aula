// ------------------------------------------------------------------
// Tradução das definições do léxico (que estão em inglês) para o
// português. Usa o Google Tradutor uma vez por palavra e guarda o
// resultado no computador: depois abre sem internet.
// ------------------------------------------------------------------
use crate::biblia::http;
use crate::dados::{write_atomic, Pasta};
use serde_json::Value;
use tauri::State;

fn valid_strong(s: &str) -> bool {
    !s.is_empty() && s.len() <= 12 && s.chars().all(|c| c.is_ascii_alphanumeric())
}

fn cache_path(pasta: &Pasta, strong: &str) -> std::path::PathBuf {
    pasta.0.join("lexico-pt").join(format!("{strong}.txt"))
}

/// tradução já guardada (ou nada)
#[tauri::command]
pub fn traducao_lexico(strong: String, pasta: State<Pasta>) -> Option<String> {
    if !valid_strong(&strong) {
        return None;
    }
    std::fs::read_to_string(cache_path(&pasta, &strong)).ok()
}

/// traduz a definição e guarda
#[tauri::command]
pub async fn traduzir_lexico(strong: String, texto: String, pasta: State<'_, Pasta>) -> Result<String, String> {
    if !valid_strong(&strong) {
        return Err("Palavra inválida.".into());
    }
    if let Ok(t) = std::fs::read_to_string(cache_path(&pasta, &strong)) {
        return Ok(t);
    }
    let texto: String = texto.chars().take(12000).collect();
    let res = http()
        .post("https://translate.googleapis.com/translate_a/single")
        .query(&[("client", "gtx"), ("sl", "en"), ("tl", "pt"), ("dt", "t")])
        .form(&[("q", texto.as_str())])
        .send()
        .await
        .map_err(|_| "Sem internet para traduzir agora. Na próxima vez com internet a tradução fica guardada.".to_string())?;
    if !res.status().is_success() {
        return Err(format!("O tradutor respondeu {}. Tente de novo em instantes.", res.status().as_u16()));
    }
    let v: Value = res.json().await.map_err(|_| "Resposta estranha do tradutor.".to_string())?;
    let mut out = String::new();
    if let Some(parts) = v.get(0).and_then(|p| p.as_array()) {
        for p in parts {
            if let Some(s) = p.get(0).and_then(|s| s.as_str()) {
                out.push_str(s);
            }
        }
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        return Err("O tradutor não devolveu nada.".into());
    }
    let path = cache_path(&pasta, &strong);
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    let _ = write_atomic(&path, out.as_bytes());
    Ok(out)
}
