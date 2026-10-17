// esconde o terminal no Windows (versão final)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    modo_aula_lib::run()
}
