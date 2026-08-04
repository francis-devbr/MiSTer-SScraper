# MiSTer S-Scraper V6

## Modos automáticos

### Localhost

Ao abrir em `localhost` ou `127.0.0.1`, o projeto usa o agente Node e habilita:

- diretório local pelo backend;
- SSH/SFTP;
- sincronização com o MiSTer;
- cache e preview;
- testes do ScreenScraper e MiSTer.

Execute:

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

### Hospedado online

Ao abrir por um domínio público, o projeto usa apenas recursos do navegador:

- seleção da pasta `games`;
- identificação das plataformas;
- credenciais ScreenScraper no `localStorage`;
- consulta à API;
- geração e download de ZIP;
- nenhuma opção SSH/SFTP é exibida.

## Avisos e erros

Falhas de credenciais, conexão, seleção de diretório e scraping são exibidas em
modal. O log permanece como diagnóstico técnico.

## Observação sobre CORS

A API do ScreenScraper pode bloquear chamadas diretas feitas por um domínio
hospedado. Nesse caso, será necessária uma função serverless/proxy no mesmo
domínio. O modal informa claramente quando isso ocorrer.


## Coleções em subpastas

A varredura é recursiva. Cada diretório que contém ROMs recebe sua própria
pasta `media`.

Exemplo:

```text
MegaDrive/
└── ROMS HACKS TRADUZIDAS !/
    └── 12- ROMS T+TURCA !/
        ├── Jogo Traduzido.bin
        └── media/
            ├── Jogo Traduzido.png
            └── Jogo Traduzido-BG.png
```

Pastas chamadas `media` são ignoradas durante a busca de ROMs.


## Separação automática de modos

A aplicação detecta o hostname:

- `localhost`, `127.0.0.1` ou `::1`: modo local com SSH/SFTP.
- Qualquer domínio público: modo web sem opções de MiSTer via rede.

No modo web são exibidos somente seleção de diretório, ScreenScraper e
download ZIP.


## Gravação direta no cartão SD

No modo web, Chrome e Edge usam `showDirectoryPicker()` para selecionar a raiz
do cartão SD ou a pasta `games`. Após a permissão de leitura e gravação, o
scraper cria uma pasta `media` em cada diretório que contém ROMs.

Em navegadores sem File System Access API, o seletor funciona em somente
leitura e o resultado deve ser baixado como ZIP.


## Plataformas personalizadas no modo web

O editor web salva as alterações no `localStorage`. Quando o cartão foi aberto
com permissão de gravação, as mesmas alterações são gravadas em
`games/peas_local.json`. Ao selecionar o cartão novamente, esse arquivo é
carregado e combinado com o catálogo padrão.
