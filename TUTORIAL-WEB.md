# Tutorial do modo web

## 1. Credenciais ScreenScraper

Preencha Developer ID, Developer Password, usuário e senha. Clique em
**Testar ScreenScraper**. As credenciais ficam no localStorage do navegador.

## 2. Escolher o cartão SD

Clique em **Escolher cartão SD ou pasta games**. Selecione a raiz do cartão ou
diretamente a pasta `games`.

## 3. Permissão de gravação

No Chrome e Edge, conceda leitura e gravação. O indicador verde confirma que
as mídias podem ser salvas diretamente no cartão.

## 4. Plataforma

Selecione a plataforma. Use **Editar plataforma** para ajustar pastas,
aliases, formatos e ScreenScraper ID.

## 5. Pastas não reconhecidas

Use o card **Gerenciar plataformas** para adicionar pastas que não foram
associadas ao catálogo.

## 6. ROMs e mídias

O card ROMs mostra diretório, capa e fundo. Verde significa existente;
vermelho significa ausente.

## 7. Salvar no cartão

Clique em **Salvar diretamente no cartão**. O site cria uma pasta `media` ao
lado das ROMs e grava `Jogo.png` e `Jogo-BG.png`.

## 8. Baixar ZIP

Use **Baixar ZIP** no modo somente leitura ou quando não quiser alterar o
cartão.

## 9. Progresso

Acompanhe percentual, quantidade restante, tempo decorrido e estimativa. Use
**Parar Scraper** para interromper.

## 10. Problemas comuns

- HTTP 405: atualize com Ctrl + F5.
- CORS: pode ser necessário um proxy no Worker.
- Plataforma ausente: adicione pelo editor.
- Sem gravação: selecione novamente no Chrome/Edge e permita leitura e escrita.
