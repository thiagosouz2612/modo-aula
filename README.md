# Modo Aula

Aplicativo para Windows do Curso de Teologia Bethel. Apresenta os slides (PDF) e os textos bíblicos da aula e projeta pela rede local, **sem depender de internet**. É feito em Rust com [Tauri 2](https://tauri.app) e a interface em React.

## O que ele faz

- **Aulas**: título, slides em PDF, textos bíblicos na ordem da aula (até 3 versões por texto) e pastas. Tudo fica guardado no computador.
- **Trazer da plataforma**: entra com o login de professor do site e traz as aulas do modo aula, com os PDFs, os destaques e os comentários dos slides.
- **Apresentar**:
  - alterna entre slides e textos (tecla T);
  - um versículo por vez em textos com 2 ou mais versículos (V);
  - tradução, original ou interlinear (O);
  - marca-texto em 4 cores e borracha;
  - busca de qualquer texto na hora (/);
  - tela preta (B) e capa da aula (C).
- **Bíblia**:
  - leitura das versões, do original grego e hebraico e do interlinear, com Strong;
  - estudo da palavra (morfologia e léxico);
  - "Projetar" o trecho escolhido na hora.
- **Projetor**: abre a projeção em tela cheia no segundo monitor (HDMI) com um clique (P).
- **Telas na rede**: qualquer TV, computador ou celular na mesma rede abre `http://<ip-do-computador>:7777` e vê a projeção ao vivo. Vai direto do computador do professor para a tela, sem internet.
- **Bíblia sem internet**:
  - cada livro é baixado do site na primeira vez e fica guardado;
  - em Ajustes → Bíblia sem internet dá para baixar tudo antes da aula.

## Gerar o instalador (.exe) pelo GitHub

O instalador do Windows é gerado pelo próprio GitHub, de graça. Não precisa instalar nada no computador.

1. Crie um repositório **novo** no GitHub (por exemplo `modo-aula`). Pode ser privado. Ele fica separado do repositório do site.
2. Envie esta pasta para ele:
   ```
   cd modo-aula
   git init
   git add -A
   git commit -m "Modo Aula 1.0"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/modo-aula.git
   git push -u origin main
   ```
3. No GitHub, abra a aba **Actions**. O roteiro "Instalador Windows" começa sozinho e leva de 10 a 15 minutos na primeira vez.
4. Quando ficar verde, clique na execução. Em **Artifacts**, baixe `Modo-Aula-instalador-Windows`. Dentro do .zip está o `Modo Aula_1.0.0_x64-setup.exe`.
5. Para lançar uma versão nova, mude o número em `src-tauri/tauri.conf.json` e `package.json` e crie uma tag:
   ```
   git tag v1.0.1
   git push --tags
   ```
   O instalador também aparece em **Releases**.

### Ao instalar

- O Windows pode mostrar "O Windows protegeu o computador" (SmartScreen). Isso acontece porque o app não tem certificado de assinatura digital, que é pago. Clique em **Mais informações** → **Executar assim mesmo**.
- Na primeira vez que o app abrir, o Firewall do Windows pergunta se ele pode usar a rede. Marque **Redes privadas** e clique em **Permitir**. É isso que deixa as outras telas se conectarem.

## Primeiro uso

1. **Ajustes → Plataforma**: entre com o login de professor e clique em **Trazer as aulas**.
2. **Ajustes → Bíblia sem internet**: escolha as versões e clique em **Baixar agora**. São cerca de 1,5 MB por versão, mais uns 13 MB do grego e hebraico.
3. Abra uma aula e clique em **Apresentar**. Com o projetor ligado no cabo, clique em **Projetor** e escolha a tela do projetor.

## Para quem for mexer no código

Requisitos: Node 22, Rust (rustup) e, no Windows, o WebView2 (já vem no Windows 10/11).

```
npm install
npm run tauri dev     # abre o app em modo de desenvolvimento
npm run tauri build   # gera o instalador
```

Para testar só a interface no navegador:

```
BIBLIA_DEV=/caminho/para/site/public/biblia npm run dev
```

Depois abra http://localhost:1420. A tela da projeção de teste fica em `/tela.html?demo=1`.

### Estrutura

```
src/                     interface (React + Tailwind)
  main.tsx               app do professor
  tela.tsx               página da projeção (projetor e telas da rede)
  components/Palco.tsx   desenho da tela projetada (igual em todo lugar)
  screens/               Aulas, AulaEditor, Apresentar, Biblia, Ajustes
  lib/                   Bíblia, PDF, marca-texto, aulas, ponte com o Rust
src-tauri/src/           parte nativa (Rust)
  transmissao.rs         servidor local da projeção (HTTP + WebSocket, porta 7777)
  projetor.rs            janela em tela cheia no segundo monitor
  biblia.rs              Bíblia guardada no computador (baixa do site uma vez)
  plataforma.rs          login e aulas da plataforma
  dados.rs               aulas, PDFs e configuração
```

Os dados ficam em `%APPDATA%\br.com.teologiabethel.modoaula\`:

- `aulas.json`, com uma cópia do anterior em `aulas.anterior.json`;
- `arquivos\` com os PDFs;
- `biblia\` com a Bíblia guardada.
