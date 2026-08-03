# Changelog

## 6.4.0

- Adiciona barra de progresso durante o scraping.
- Exibe quantidade processada, total, percentual e ROMs restantes.
- Mostra a ROM atualmente em processamento.
- Adiciona botão Parar para interromper o scraping.
- Aborta a requisição no frontend e encerra o loop no backend.
- Fecha a conexão SFTP ao interromper o processo.
- Adiciona suporte equivalente ao modo online.


## 6.3.2

- Move o card Cache SQLite para depois do card ROMs.
- Faz o Cache SQLite ocupar toda a largura.
- Alinha os checkboxes do card ROMs.
- Uniformiza altura, espaçamento e largura das opções.
- Mantém o botão Iniciar Scraper alinhado com os controles.
- Melhora o comportamento responsivo da barra de opções.


## 6.3.1

- Corrige a regra de grid que mantinha o card ROMs em meia largura.
- Faz o card ROMs ocupar obrigatoriamente as 12 colunas.
- Coloca o card ROMs em uma linha exclusiva.
- Evita que o card Cache SQLite seja esticado pela altura das ROMs.
- Mantém comportamento responsivo em telas menores.


## 6.3.0

- Remove o card separado de opções.
- Move as opções de scraping para o topo do card de ROMs.
- Reorganiza os controles em grade responsiva.
- Mantém o botão de iniciar scraper junto da lista e paginação.
- Reduz a fragmentação visual da tela.


## 6.2.2

- Aumenta o card da lista de ROMs para ocupar toda a largura.
- Aumenta a altura útil da lista e do scroll.
- Mantém barra de paginação e controles visíveis.
- Aumenta o tamanho das linhas e do preview de artwork.
- Adiciona ajustes responsivos para telas menores.


## 6.2.1

- Adiciona indicador de loading durante a varredura de ROMs.
- Mostra mensagem diferente para leitura local e MiSTer via rede.
- Adiciona overlay neon no card de ROMs.
- Bloqueia paginação durante a leitura.
- Mostra loading ao analisar diretórios grandes no modo online.


## 6.2.0

- Exibe modal ao concluir ou falhar a varredura de ROMs.
- Adiciona paginação com 10, 25, 50 ou 100 ROMs por página.
- Exibe o diretório relativo de cada ROM.
- Adiciona indicadores verdes para artwork existente.
- Adiciona indicadores vermelhos para artwork ausente.
- Mostra capa e fundo ao passar o mouse sobre uma ROM.
- Mantém preview detalhado ao clicar na ROM.


## 6.1.0

- Faz varredura recursiva de subpastas locais e remotas.
- Ignora pastas `media` durante a varredura.
- Cria uma pasta `media` em cada diretório que contém ROMs.
- Preserva a hierarquia de subpastas no modo online e no ZIP.
- Corrige preview de artwork para ROMs em subdiretórios.
- Exibe o caminho relativo da coleção na lista e no log.


## 6.0.1

- Corrige `showModal is not defined` no modo local.
- Exibe falhas de conexão com o agente em modal.
- Mantém o card de configurações aberto quando o token é inválido.
- Interrompe testes quando o salvamento das configurações falha.
- Exibe erros de salvamento em modal e no log.


## 6.0.0

- Detecta automaticamente modo local ou online.
- Mantém SSH/SFTP somente em localhost.
- Adiciona seleção de pasta pelo navegador no modo online.
- Adiciona geração de ZIP no navegador.
- Armazena credenciais online no localStorage.
- Exibe avisos, sucessos e erros importantes em modal.
- Mantém o log apenas para diagnóstico técnico.
- Oculta completamente opções do MiSTer no modo online.


## 5.1.0

- Exibe sucesso e erros dos testes em modal.
- Mantém o card de configurações aberto durante os testes.
- Adiciona estado visual de carregamento aos botões.
- Mostra orientações específicas para erros do ScreenScraper e MiSTer.
- Mantém os detalhes também no log para diagnóstico.


## 5.0.0

- Separa interface web e agente local.
- Adiciona token de autenticação do agente.
- Adiciona cadastro de credenciais pela interface.
- Salva credenciais somente no computador do usuário.
- Adiciona teste de ScreenScraper e MiSTer.
- Permite frontend hospedado sem controle de usuários.
- Mantém URL e token do agente no localStorage.
- Restringe CORS aos domínios configurados.


## 4.0.0

- Cache SQLite de resultados do ScreenScraper.
- Preview local e remoto de capa/background.
- CI para Node 22 e 24.
- Releases automáticas por tag.
- Testes do catálogo de plataformas.
- Dependabot e documentação de contribuição/segurança.
