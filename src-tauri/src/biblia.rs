// ------------------------------------------------------------------
// Bíblia (traduções, grego/hebraico e léxico).
// Os arquivos são os mesmos da plataforma (/biblia/... em .json.gz) e
// já vêm dentro do instalador (pasta "biblia" do aplicativo): funciona
// sem internet desde a primeira vez. Se faltar algum arquivo (versão
// nova no site), ele é baixado do site e guardado na pasta de dados.
// ------------------------------------------------------------------
use crate::dados::{write_atomic, Config, Pasta};
use futures_util::{stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, State};

/// pasta da Bíblia que vem com o aplicativo
pub fn set_embutida(dir: PathBuf) {
    let _ = EMBUTIDA.set(dir);
}

pub fn http() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("ModoAula/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .expect("cliente http")
    })
}

/// só caminhos dentro de /biblia, sem ".."
fn valid_path(p: &str) -> bool {
    !p.is_empty()
        && p.len() < 120
        && !p.contains("..")
        && !p.starts_with('/')
        && p.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '-' | '_'))
}

fn local(pasta: &Pasta, p: &str) -> PathBuf {
    pasta.0.join("biblia").join(p)
}

async fn fetch(site: &str, p: &str) -> Result<Option<Vec<u8>>, String> {
    let url = format!("{site}/biblia/{p}");
    let res = http().get(&url).send().await.map_err(|_| "Sem internet para baixar este trecho da Bíblia.".to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !res.status().is_success() {
        return Err(format!("O site respondeu {} ao baixar a Bíblia.", res.status().as_u16()));
    }
    let bytes = res.bytes().await.map_err(|_| "A conexão caiu ao baixar a Bíblia.".to_string())?;
    // a página de "não encontrado" do site vem em HTML: não é arquivo da Bíblia
    if bytes.first() == Some(&b'<') {
        return Ok(None);
    }
    Ok(Some(bytes.to_vec()))
}

async fn get_or_fetch(pasta: &Pasta, site: &str, p: &str) -> Result<Option<Vec<u8>>, String> {
    let path = local(pasta, p);
    if let Ok(b) = tokio::fs::read(&path).await {
        return Ok(Some(b));
    }
    if let Some(dir) = EMBUTIDA.get() {
        if let Ok(b) = tokio::fs::read(dir.join(p)).await {
            return Ok(Some(b));
        }
    }
    let Some(bytes) = fetch(site, p).await? else { return Ok(None) };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    write_atomic(&path, &bytes)?;
    Ok(Some(bytes))
}

/// um arquivo da Bíblia (do computador; se ainda não tiver, baixa do site)
#[tauri::command]
pub async fn biblia(caminho: String, pasta: State<'_, Pasta>, cfg: State<'_, Config>) -> Result<Response, String> {
    if !valid_path(&caminho) {
        return Err("Caminho inválido.".into());
    }
    let site = cfg.get().site;
    match get_or_fetch(&pasta, &site, &caminho).await? {
        Some(b) => Ok(Response::new(b)),
        None => Err("404".into()),
    }
}

#[derive(Serialize)]
pub struct Status {
    arquivos: usize,
    bytes: u64,
    versoes: Vec<String>,
    originais: usize,
}

fn walk(dir: &std::path::Path, n: &mut usize, b: &mut u64) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(&p, n, b);
            } else if let Ok(m) = e.metadata() {
                *n += 1;
                *b += m.len();
            }
        }
    }
}

/// o que já está guardado no computador
#[tauri::command]
pub fn biblia_status(pasta: State<Pasta>) -> Status {
    // a que veio no aplicativo conta como guardada
    let root = match EMBUTIDA.get() {
        Some(d) if d.join("versoes.json").exists() => d.clone(),
        _ => pasta.0.join("biblia"),
    };
    let (mut arquivos, mut bytes) = (0, 0);
    walk(&root, &mut arquivos, &mut bytes);
    let mut versoes = vec![];
    if let Ok(rd) = std::fs::read_dir(root.join("textos")) {
        for e in rd.flatten() {
            // versão completa = os 66 livros
            let n = std::fs::read_dir(e.path()).map(|r| r.count()).unwrap_or(0);
            if n >= 66 {
                versoes.push(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    versoes.sort();
    let mut originais = 0;
    walk(&root.join("originais"), &mut originais, &mut 0);
    Status { arquivos, bytes, versoes, originais }
}

#[derive(Deserialize)]
struct Book {
    id: String,
    chapters: u32,
}
#[derive(Deserialize)]
struct Catalog {
    books: Vec<Book>,
}

#[derive(Clone, Serialize)]
struct Progresso {
    feitos: usize,
    total: usize,
    falhas: usize,
    fim: bool,
    erro: Option<String>,
}

static EMBUTIDA: OnceLock<PathBuf> = OnceLock::new();

static BAIXANDO: AtomicBool = AtomicBool::new(false);

/// baixa as versões escolhidas (e, se quiser, grego/hebraico e léxico) para usar sem internet
#[tauri::command]
pub async fn baixar_biblia(
    app: AppHandle,
    versoes: Vec<String>,
    originais: bool,
    pasta: State<'_, Pasta>,
    cfg: State<'_, Config>,
) -> Result<(), String> {
    if BAIXANDO.swap(true, Ordering::SeqCst) {
        return Err("O download já está em andamento.".into());
    }
    let site = cfg.get().site;
    let pasta = Pasta(pasta.0.clone());
    let result = async {
        // só o que não veio no aplicativo nem foi baixado antes
        let cat_bytes = get_or_fetch(&pasta, &site, "versoes.json").await?.ok_or("Catálogo da Bíblia não encontrado no site.")?;
        // o catálogo sempre vem de novo do site quando houver internet
        if let Ok(Some(fresh)) = fetch(&site, "versoes.json").await {
            let _ = write_atomic(&local(&pasta, "versoes.json"), &fresh);
        }
        let cat: Catalog = serde_json::from_slice(&cat_bytes).map_err(|_| "Catálogo da Bíblia inválido.".to_string())?;

        let mut list: Vec<String> = vec![];
        for v in &versoes {
            if !v.chars().all(|c| c.is_ascii_alphanumeric()) {
                continue;
            }
            for b in &cat.books {
                list.push(format!("textos/{v}/{}.json.gz", b.id));
            }
        }
        for b in &cat.books {
            list.push(format!("titulos/{}.json.gz", b.id));
        }
        if originais {
            for b in &cat.books {
                for c in 1..=b.chapters {
                    list.push(format!("originais/{}/{c}.json.gz", b.id));
                }
            }
            let g = (0..=56).chain([60, 68, 70, 75, 93, 94, 95, 99]).map(|n| format!("G{n:02}"));
            let h = (0..=86).chain([90]).map(|n| format!("H{n:02}"));
            for part in g.chain(h) {
                list.push(format!("lexico/{part}.json.gz"));
            }
        }
        // só o que ainda falta
        list.retain(|p| !local(&pasta, p).exists() && !EMBUTIDA.get().is_some_and(|d| d.join(p).exists()));

        let total = list.len();
        let feitos = Arc::new(AtomicUsize::new(0));
        let falhas = Arc::new(AtomicUsize::new(0));
        let emit = |fim: bool, erro: Option<String>| {
            let _ = app.emit(
                "biblia-progresso",
                Progresso { feitos: feitos.load(Ordering::SeqCst), total, falhas: falhas.load(Ordering::SeqCst), fim, erro },
            );
        };
        emit(false, None);
        let site = &site;
        let pasta = &pasta;
        stream::iter(list)
            .map(|p| async move {
                let mut ok = false;
                for _ in 0..3 {
                    match get_or_fetch(pasta, site, &p).await {
                        Ok(_) => {
                            ok = true;
                            break;
                        }
                        Err(_) => tokio::time::sleep(Duration::from_millis(800)).await,
                    }
                }
                ok
            })
            .buffer_unordered(8)
            .for_each(|ok| {
                if !ok {
                    falhas.fetch_add(1, Ordering::SeqCst);
                }
                let n = feitos.fetch_add(1, Ordering::SeqCst) + 1;
                if n % 10 == 0 || n == total {
                    emit(false, None);
                }
                async {}
            })
            .await;
        emit(true, None);
        Ok::<(), String>(())
    }
    .await;
    BAIXANDO.store(false, Ordering::SeqCst);
    if let Err(e) = &result {
        let _ = app.emit("biblia-progresso", Progresso { feitos: 0, total: 0, falhas: 0, fim: true, erro: Some(e.clone()) });
    }
    result
}

/// apaga a Bíblia guardada (volta a baixar quando abrir)
#[tauri::command]
pub fn apagar_biblia(pasta: State<Pasta>) -> Result<(), String> {
    let root = pasta.0.join("biblia");
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())
}
