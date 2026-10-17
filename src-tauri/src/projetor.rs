// ------------------------------------------------------------------
// Janela da projeção: abre em tela cheia no monitor escolhido
// (normalmente o projetor ligado no cabo HDMI). Ela recebe a tela
// pelo mesmo servidor local das outras telas, então tudo que aparece
// no projetor também aparece igual na rede.
// ------------------------------------------------------------------
use crate::transmissao::porta;
use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Serialize)]
pub struct Monitor {
    indice: usize,
    nome: String,
    largura: u32,
    altura: u32,
    principal: bool,
}

#[tauri::command]
pub fn listar_monitores(app: AppHandle) -> Result<Vec<Monitor>, String> {
    let main = app.get_webview_window("main").ok_or("Janela principal não encontrada.")?;
    let primary = main.primary_monitor().ok().flatten();
    let list = main.available_monitors().map_err(|e| e.to_string())?;
    Ok(list
        .iter()
        .enumerate()
        .map(|(i, m)| Monitor {
            indice: i,
            nome: m.name().cloned().unwrap_or_else(|| format!("Tela {}", i + 1)),
            largura: m.size().width,
            altura: m.size().height,
            principal: primary.as_ref().is_some_and(|p| p.position() == m.position()),
        })
        .collect())
}

#[tauri::command]
pub async fn abrir_projetor(app: AppHandle, monitor: usize) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Janela principal não encontrada.")?;
    let list = main.available_monitors().map_err(|e| e.to_string())?;
    let m = list.get(monitor).or(list.first()).ok_or("Nenhum monitor encontrado.")?.clone();
    let sozinho = list.len() < 2;
    let scale = m.scale_factor();
    let pos = m.position().to_logical::<f64>(scale);
    let size = m.size().to_logical::<f64>(scale);

    // sempre abre de novo, já no monitor certo
    if let Some(w) = app.get_webview_window("tela") {
        let _ = w.destroy();
    }
    let url = format!("tela.html?porta={}&janela=1", porta(&app));
    let builder = WebviewWindowBuilder::new(&app, "tela", WebviewUrl::App(url.into()))
        .title("Modo Aula — Projeção")
        .background_color(tauri::window::Color(0, 0, 0, 255));
    let win = if sozinho {
        // só um monitor (sem projetor ligado): abre numa janela comum, para testar
        builder
            .decorations(true)
            .inner_size(960.0, 540.0)
            .position(pos.x + 60.0, pos.y + 60.0)
            .build()
            .map_err(|e| e.to_string())?
    } else {
        builder
            .decorations(false)
            .position(pos.x, pos.y)
            .inner_size(size.width, size.height)
            .build()
            .map_err(|e| e.to_string())?
    };
    if !sozinho {
        win.set_fullscreen(true).map_err(|e| e.to_string())?;
    }
    // o foco volta para o apresentador (as setas continuam funcionando)
    let _ = main.set_focus();
    Ok(())
}

#[tauri::command]
pub fn fechar_projetor(app: AppHandle) {
    if let Some(w) = app.get_webview_window("tela") {
        let _ = w.close();
    }
}
