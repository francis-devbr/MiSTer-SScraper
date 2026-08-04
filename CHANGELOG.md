# Changelog

## 6.10.0

- Adiciona botão Ajuda no cabeçalho do modo web.
- Adiciona tutorial interativo em modal.
- Divide o tutorial em dez etapas navegáveis.
- Explica credenciais, cartão SD, permissões, plataformas, ROMs, gravação e ZIP.
- Inclui seção de solução de problemas comuns.
- Permite navegar pelas etapas pela lateral ou pelos botões Anterior e Próxima.
- Adiciona layout responsivo do tutorial para celulares.


## 6.9.1

- Move o botão Editar plataforma para o cabeçalho do card Plataforma.
- Altera o botão para Fechar editor enquanto o editor estiver aberto.
- Coloca o card Editor de plataforma imediatamente após Plataforma.
- Coloca Gerenciar plataformas depois do editor.
- Remove o botão duplicado de edição do card Gerenciar plataformas.
- Ajusta o editor web para o mesmo fluxo vertical usado no localhost.
- Mantém sugestões de pastas não reconhecidas no card Gerenciar plataformas.


## 6.9.0

- Corrige o preview flutuante para exibir capa e fundo reais do cartão.
- Corrige cards Preview e Log para ocuparem toda a largura.
- Evita títulos espremidos e quebra incorreta do layout.
- Adiciona editor de plataformas ao modo web.
- Lista pastas do cartão que não foram reconhecidas.
- Permite adicionar plataformas manualmente.
- Permite editar aliases, pastas, formatos e ScreenScraper ID.
- Salva personalizações automaticamente no localStorage.
- Salva também em games/peas_local.json quando há permissão de gravação.
- Carrega e combina peas_local.json ao selecionar o cartão.
- Reescaneia o cartão após salvar uma plataforma.


## 6.8.0

- Compartilha cards minimizáveis entre os modos local e web.
- Reorganiza a interface web com o mesmo padrão visual do localhost.
- Move ações de gravação e ZIP para o card ROMs.
- Mantém o card ROMs em largura total e com maior altura.
- Adiciona progresso rico dentro do card ROMs web.
- Lê pastas media existentes diretamente do cartão SD.
- Exibe indicadores verdes/vermelhos reais para capa e fundo.
- Atualiza indicadores após gravação direta.
- Adiciona preview de capa e fundo por clique.
- Mostra o diretório relativo de cada ROM.
- Torna o log web minimizável e recolhido por padrão.


## 6.7.0

- Adiciona seleção da raiz do cartão SD ou da pasta games.
- Usa File System Access API no Chrome e Edge.
- Solicita permissão de leitura e gravação pelo navegador.
- Cria pastas media diretamente ao lado das ROMs.
- Salva capa e fundo diretamente no cartão SD.
- Exibe indicador de acesso de gravação, somente leitura ou sem acesso.
- Mantém seleção webkitdirectory para navegadores sem suporte.
- Adiciona botão Salvar diretamente no cartão.
- Mantém botão Baixar ZIP como fallback.
- Remove qualquer chamada HTTP do botão de seleção de diretório.


## 6.6.0

- Separa visualmente e funcionalmente os modos local e web.
- Oculta completamente MiSTer via rede no domínio publicado.
- Oculta IP, porta, usuário, senha SSH e teste do MiSTer no modo web.
- Mantém SSH/SFTP somente em localhost e 127.0.0.1.
- Adiciona badges LOCAL e WEB no cabeçalho.
- Adiciona aviso explicativo no modo web.
- Mantém no modo web apenas seleção da pasta games e geração de ZIP.


## 6.5.0

- Substitui Iniciar/Processando/Parar por um único botão contextual.
- Exibe somente `Parar Scraper` durante o processamento.
- Adiciona tempo decorrido em tempo real.
- Calcula estimativa de tempo restante pela média das ROMs concluídas.
- Exibe capa da ROM atual assim que ela é baixada.
- Mostra placeholder enquanto a capa ainda não está disponível.
- Reorganiza progresso, métricas e ROM atual em layout mais profissional.
- Adiciona os mesmos tempos e botão único ao modo online.


## 6.4.1

- Lê as regiões de mídia disponíveis no resultado do jogo.
- Prioriza a mídia realmente existente antes dos fallbacks genéricos.
- Tenta automaticamente `wor`, `us`, `eu`, `br`, `jp` e outras regiões.
- Evita deixar jogos sem capa quando existe artwork em outra região.
- Registra no log cada mídia tentada e a variante encontrada.
- Aplica o mesmo fallback ao modo online.


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
