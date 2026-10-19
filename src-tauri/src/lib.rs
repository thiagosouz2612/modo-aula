// ------------------------------------------------------------------
// Modo Aula — parte nativa (Rust)
//
// - dados.rs        aulas, apresentações (PDF) e configuração no computador
// - biblia.rs       Bíblia: baixa uma vez da plataforma e guarda para usar sem internet
// - plataforma.rs   entrar com a conta de professor e trazer as aulas do site
// - transmissao.rs  servidor da projeção na rede local (HTTP + WebSocket)
// - projetor.rs     janela da projeção em tela cheia no segundo monitor
// ------------------------------------------------------------------
mod biblia;
mod dados;
mod lexico;
mod plataforma;
mod projetor;
mod transmissao;

use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(dir.join("arquivos"))?;
            std::fs::create_dir_all(dir.join("biblia"))?;
            app.manage(dados::Pasta(dir.clone()));
            app.manage(dados::Config::load(&dir));
            // Bíblia que vem dentro do instalador
            let embutida = app
                .path()
                .resolve("biblia", tauri::path::BaseDirectory::Resource)
                .unwrap_or_else(|_| dir.join("biblia-embutida"));
            biblia::set_embutida(embutida);

            let cast = Arc::new(transmissao::Cast::new());
            app.manage(cast.clone());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move { transmissao::serve(handle, cast).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dados::ler_dados,
            dados::salvar_dados,
            dados::salvar_arquivo,
            dados::ler_arquivo,
            dados::apagar_arquivo,
            dados::tem_arquivo,
            dados::config,
            dados::definir_site,
            dados::roteiro_ler,
            dados::roteiro_salvar,
            dados::roteiro_apagar,
            dados::salvar_copia,
            biblia::biblia,
            biblia::biblia_status,
            biblia::baixar_biblia,
            biblia::apagar_biblia,
            lexico::traducao_lexico,
            lexico::traduzir_lexico,
            plataforma::entrar,
            plataforma::sair,
            plataforma::baixar_aulas,
            plataforma::baixar_arquivo,
            plataforma::plataforma_roteiros,
            plataforma::plataforma_roteiros_salvar,
            plataforma::plataforma_enviar_aulas,
            plataforma::plataforma_tem_arquivo,
            plataforma::plataforma_enviar_arquivo,
            transmissao::transmitir,
            transmissao::guardar_imagem,
            transmissao::tem_imagem,
            transmissao::info_transmissao,
            projetor::listar_monitores,
            projetor::abrir_projetor,
            projetor::fechar_projetor,
        ])
        .run(tauri::generate_context!())
        .expect("não foi possível abrir o Modo Aula");
}
