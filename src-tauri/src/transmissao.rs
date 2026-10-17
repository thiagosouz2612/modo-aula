// ------------------------------------------------------------------
// Transmissão pela rede local (sem internet, sem Ably, sem banco).
//
// O Modo Aula abre um pequeno servidor no próprio computador
// (porta 7777). Qualquer tela na mesma rede (Wi-Fi ou cabo) abre
// http://<ip-do-computador>:7777 e vê a projeção ao vivo. A janela
// do projetor no segundo monitor usa o mesmo caminho.
//
//   /           página da projeção (tela.html, embutida no aplicativo)
//   /assets/*   arquivos da página
//   /ws         WebSocket: recebe a tela atual e cada mudança
//   /estado     a tela atual em JSON (para quem não tem WebSocket)
//   /img/<id>   imagem do slide (JPEG desenhado pelo apresentador)
// ------------------------------------------------------------------
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State as AxState};
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::broadcast;

const PORTAS: std::ops::RangeInclusive<u16> = 7777..=7787;
const MAX_IMGS: usize = 400;

pub struct Imgs {
    map: HashMap<String, Arc<Vec<u8>>>,
    order: VecDeque<String>,
}

pub struct Cast {
    tx: broadcast::Sender<Arc<String>>,
    last: RwLock<Arc<String>>,
    imgs: Mutex<Imgs>,
    porta: AtomicU16,
    telas: AtomicUsize,
}

impl Cast {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Cast {
            tx,
            last: RwLock::new(Arc::new(r#"{"s":{"k":"logo"},"tema":"noite","escala":1}"#.to_string())),
            imgs: Mutex::new(Imgs { map: HashMap::new(), order: VecDeque::new() }),
            porta: AtomicU16::new(0),
            telas: AtomicUsize::new(0),
        }
    }
}

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    cast: Arc<Cast>,
}

pub async fn serve(app: AppHandle, cast: Arc<Cast>) {
    let ctx = Ctx { app: app.clone(), cast: cast.clone() };
    let router = Router::new()
        .route("/ws", get(ws))
        .route("/estado", get(estado))
        .route("/img/{id}", get(img))
        .fallback(get(asset))
        .with_state(ctx);
    for porta in PORTAS {
        if let Ok(listener) = tokio::net::TcpListener::bind(("0.0.0.0", porta)).await {
            cast.porta.store(porta, Ordering::SeqCst);
            let _ = app.emit("transmissao-pronta", porta);
            let _ = axum::serve(listener, router).await;
            return;
        }
    }
    let _ = app.emit("transmissao-erro", "Nenhuma porta livre entre 7777 e 7787.");
}

async fn ws(upgrade: WebSocketUpgrade, AxState(ctx): AxState<Ctx>) -> Response {
    upgrade.on_upgrade(move |socket| tela(socket, ctx))
}

fn avisar_telas(ctx: &Ctx) {
    let _ = ctx.app.emit("telas", ctx.cast.telas.load(Ordering::SeqCst));
}

async fn tela(socket: WebSocket, ctx: Ctx) {
    let (mut tx, mut rx) = socket.split();
    let mut sub = ctx.cast.tx.subscribe();
    ctx.cast.telas.fetch_add(1, Ordering::SeqCst);
    avisar_telas(&ctx);

    let first = ctx.cast.last.read().unwrap().clone();
    if tx.send(Message::Text(first.as_str().into())).await.is_ok() {
        let mut ping = tokio::time::interval(Duration::from_secs(15));
        loop {
            tokio::select! {
                msg = sub.recv() => match msg {
                    Ok(s) => if tx.send(Message::Text(s.as_str().into())).await.is_err() { break },
                    // a tela ficou para trás: manda só a mais recente
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let s = ctx.cast.last.read().unwrap().clone();
                        if tx.send(Message::Text(s.as_str().into())).await.is_err() { break }
                    }
                    Err(_) => break,
                },
                got = rx.next() => match got {
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    _ => {}
                },
                _ = ping.tick() => if tx.send(Message::Ping(Vec::new().into())).await.is_err() { break },
            }
        }
    }
    ctx.cast.telas.fetch_sub(1, Ordering::SeqCst);
    avisar_telas(&ctx);
}

async fn estado(AxState(ctx): AxState<Ctx>) -> Response {
    let s = ctx.cast.last.read().unwrap().clone();
    ([(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], s.as_str().to_string()).into_response()
}

async fn img(Path(id): Path<String>, AxState(ctx): AxState<Ctx>) -> Response {
    let id = id.trim_end_matches(".jpg").to_string();
    let data = ctx.cast.imgs.lock().unwrap().map.get(&id).cloned();
    match data {
        Some(b) => ([(header::CONTENT_TYPE, "image/jpeg"), (header::CACHE_CONTROL, "public, max-age=86400, immutable")], b.as_ref().clone()).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// a página da projeção vem de dentro do próprio aplicativo
async fn asset(uri: Uri, AxState(ctx): AxState<Ctx>) -> Response {
    let mut path = uri.path().trim_start_matches('/').to_string();
    if path.is_empty() {
        path = "tela.html".into();
    }
    if path == "index.html" {
        // o painel do professor não fica aberto para a rede
        return StatusCode::NOT_FOUND.into_response();
    }
    match ctx.app.asset_resolver().get(path) {
        Some(a) => {
            let cache = if uri.path().starts_with("/assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
            ([(header::CONTENT_TYPE, a.mime_type.clone()), (header::CACHE_CONTROL, cache.to_string())], a.bytes.clone()).into_response()
        }
        None => (StatusCode::NOT_FOUND, "Modo Aula: página não encontrada").into_response(),
    }
}

// ---------------- comandos do apresentador ----------------

/// nova tela para todos os projetores
#[tauri::command]
pub fn transmitir(estado: String, cast: State<Arc<Cast>>) {
    let s = Arc::new(estado);
    *cast.last.write().unwrap() = s.clone();
    let _ = cast.tx.send(s);
}

/// imagem do slide (JPEG), guardada na memória enquanto o app estiver aberto
#[tauri::command]
pub fn guardar_imagem(request: Request, cast: State<Arc<Cast>>) -> Result<(), String> {
    let id = request
        .headers()
        .get("x-id")
        .and_then(|v| v.to_str().ok())
        .filter(|s| crate::dados::valid_id(s))
        .ok_or("Imagem sem nome.")?
        .to_string();
    let InvokeBody::Raw(bytes) = request.body() else { return Err("Imagem inválida.".into()) };
    let mut imgs = cast.imgs.lock().unwrap();
    if imgs.map.insert(id.clone(), Arc::new(bytes.clone())).is_none() {
        imgs.order.push_back(id);
    }
    while imgs.order.len() > MAX_IMGS {
        if let Some(old) = imgs.order.pop_front() {
            imgs.map.remove(&old);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn tem_imagem(id: String, cast: State<Arc<Cast>>) -> bool {
    cast.imgs.lock().unwrap().map.contains_key(&id)
}

#[derive(Serialize)]
pub struct Info {
    porta: u16,
    enderecos: Vec<String>,
    telas: usize,
}

/// endereços deste computador na rede (para as outras telas abrirem)
#[tauri::command]
pub fn info_transmissao(cast: State<Arc<Cast>>) -> Info {
    let porta = cast.porta.load(Ordering::SeqCst);
    let mut enderecos: Vec<String> = vec![];
    if let Ok(list) = local_ip_address::list_afinet_netifas() {
        for (nome, ip) in list {
            let std::net::IpAddr::V4(v4) = ip else { continue };
            if v4.is_loopback() || v4.is_link_local() {
                continue;
            }
            let n = nome.to_lowercase();
            // adaptadores virtuais (VirtualBox, Hyper-V, WSL, VPN) por último
            let virtual_ = ["virtual", "vethernet", "vbox", "vmware", "wsl", "docker", "tailscale", "zerotier", "hyper-v"].iter().any(|k| n.contains(k));
            let s = v4.to_string();
            if virtual_ {
                enderecos.push(s);
            } else {
                enderecos.insert(0, s);
            }
        }
    }
    // o endereço preferido (o da rota para a internet) vem primeiro
    if let Ok(std::net::IpAddr::V4(main)) = local_ip_address::local_ip() {
        let s = main.to_string();
        enderecos.retain(|e| e != &s);
        enderecos.insert(0, s);
    }
    enderecos.dedup();
    Info { porta, enderecos, telas: cast.telas.load(Ordering::SeqCst) }
}

#[allow(dead_code)]
pub fn porta(app: &AppHandle) -> u16 {
    app.state::<Arc<Cast>>().porta.load(Ordering::SeqCst)
}
