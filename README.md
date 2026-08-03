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
