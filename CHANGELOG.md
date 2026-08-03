# Changelog

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
