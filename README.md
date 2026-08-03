# MiSTer S-Scraper V5

Aplicação para gerar e sincronizar artwork do Console Mode usando uma
interface web e um agente local.

## Arquitetura

```text
Site React hospedado ou local
        |
        | HTTP + token
        v
Agente local em 127.0.0.1:3001
        |
        +-- pasta local de ROMs
        +-- ScreenScraper API
        +-- SSH/SFTP para o MiSTer
```

O site não precisa de contas de usuário. Cada pessoa executa seu próprio
agente local e cadastra suas credenciais na interface.

## Onde os dados ficam

- URL e token do agente: `localStorage` do navegador.
- Estado dos cards e preferências visuais: `localStorage`.
- Credenciais ScreenScraper e SSH: `server/settings.json`, no computador.
- Cache: `server/data/cache.sqlite`.
- O arquivo `server/settings.json` está no `.gitignore`.

## Instalação local

```bash
npm install
npm run agent
```

O terminal mostrará:

```text
Agente local: http://127.0.0.1:3001
Token do agente: ...
```

Em outro terminal:

```bash
npm run client
```

Abra `http://localhost:5173`, clique em **Configurações**, informe a URL e
cole o token.

## Hospedagem do frontend

Você pode publicar o conteúdo de `dist/` em GitHub Pages, Netlify, Vercel ou
outro host estático:

```bash
npm run build
```

Cada usuário ainda precisa executar o agente local.

Para autorizar o domínio hospedado, adicione-o em
`agent.allowedOrigins` no `server/config.json`, ou inicie temporariamente com:

```bash
AGENT_ALLOW_ANY_ORIGIN=1 npm run agent
```

Em produção, prefira cadastrar explicitamente o domínio.

## Configuração

Na interface, cada usuário informa:

- Developer ID e Developer Password do ScreenScraper
- usuário e senha do ScreenScraper
- IP, porta, usuário e senha SSH do MiSTer
- pasta remota do MiSTer

As senhas nunca são devolvidas ao frontend. A API informa apenas se elas já
estão configuradas.

## Segurança

O agente usa um token aleatório de 256 bits. O token é criado na primeira
execução e aparece no terminal. Não publique esse token.

O agente escuta em `127.0.0.1` por padrão. Não altere para `0.0.0.0` sem
entender os riscos.
