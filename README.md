# MiSTer ScreenScraper

Aplicação web em React + Express para baixar capas e imagens de fundo do
ScreenScraper e gravá-las em uma biblioteca local ou diretamente no MiSTer
via SFTP.

## Recursos

- Seleção dinâmica da pasta local `games`
- Detecção automática das plataformas encontradas
- Leitura remota de `/media/fat/games` no MiSTer
- Plataformas ausentes ficam desabilitadas
- Pastas desconhecidas aparecem como sugestões
- Catálogo baseado em `peas.json`
- Sobrescritas locais em `peas_local.json`
- Editor de aliases, pastas, extensões e ScreenScraper ID
- Detecção de região das ROMs
- Preferência por capa US quando a região não for identificada
- Download de capa e imagem `-BG`
- Interface retrô neon
- Cards minimizáveis com estado salvo no navegador

## Requisitos

- Node.js 22.5 ou superior
- npm
- Conta e credenciais de desenvolvedor do ScreenScraper
- Acesso SSH/SFTP ao MiSTer para o modo de rede

## Instalação

```bash
git clone URL_DO_SEU_REPOSITORIO
cd mister-screenscraper
npm install
npm run dev
```

Abra:

```text
http://localhost:5173
```

A API é executada em:

```text
http://localhost:3001
```

## Primeira execução

Na primeira execução, o backend cria automaticamente:

```text
server/config.json
server/peas_local.json
```

a partir de:

```text
server/config.example.json
server/peas_local.example.json
```

Edite `server/config.json` e informe suas credenciais.

```json
{
  "screenscraper": {
    "devid": "",
    "devpassword": "",
    "ssid": "",
    "sspassword": "",
    "softname": "MiSTerConsoleModeScraper",
    "delayMs": 1500,
    "boxartMedia": "box-2D",
    "backgroundMedia": "ss",
    "defaultRegion": "us"
  },
  "games": {
    "basePath": ""
  },
  "mister": {
    "host": "192.168.1.100",
    "port": 22,
    "username": "root",
    "password": "",
    "remoteBasePath": "/media/fat/games"
  },
  "artwork": {
    "boxart": true,
    "background": true,
    "extension": ".png"
  }
}
```

`server/config.json` está no `.gitignore` e não deve ser enviado ao GitHub.

## Plataformas

O projeto separa os dados em três arquivos:

| Arquivo | Finalidade |
|---|---|
| `server/peas.json` | Aliases, formatos e nomes padrão |
| `server/platform_ids.json` | IDs ScreenScraper, MobyGames e TheGamesDB |
| `server/peas_local.json` | Alterações locais feitas pelo usuário |

O editor nunca altera `peas.json`. As alterações são salvas apenas em
`peas_local.json`.

## Detecção local

Ao escolher uma pasta como:

```text
H:\games
```

o projeto compara as subpastas com:

1. ID canônico da plataforma
2. Lista de pastas configuradas
3. Aliases não ambíguos

Apenas as plataformas encontradas ficam habilitadas.

## Detecção no MiSTer

Ao escolher **MiSTer via rede**, o projeto lista as subpastas em:

```text
/media/fat/games
```

As plataformas reconhecidas ficam habilitadas. Pastas não reconhecidas são
mostradas como sugestões e podem ser adicionadas ao `peas_local.json`.

## Comandos

```bash
npm run dev
npm run build
npm start
```

## Segurança

Nunca faça commit de:

```text
server/config.json
server/settings.json
server/peas_local.json
```

Caso credenciais tenham sido publicadas anteriormente, altere as senhas antes
de tornar o repositório público.

## Licença

MIT


## Cache SQLite

As buscas concluídas são armazenadas em `server/data/cache.sqlite`. O cache reduz chamadas repetidas à API e pode ser consultado ou limpo pela interface.

## Preview

Clique em uma ROM para visualizar a capa e o background existentes, tanto no diretório local quanto no MiSTer via SFTP.

## Qualidade e releases

- `npm run ci`: sintaxe, testes e build.
- Push e pull request executam CI no Node 22 e 24.
- Tags como `v4.0.0` criam uma Release com ZIP automaticamente.
