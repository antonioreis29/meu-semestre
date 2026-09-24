# Meu Semestre

Controle acadêmico de semestre: matérias, faltas, conteúdos estudados e tarefas/provas.

Aplicação estática em JavaScript puro, sem build e sem dependências.
Os dados ficam no `localStorage` do navegador, com exportação e importação de backup em JSON.
Os anexos dos conteúdos ficam no IndexedDB do mesmo navegador e entram no backup.

## Como rodar

Basta abrir o `index.html` no navegador (duplo-clique funciona).

Os scripts são carregados como scripts clássicos, e não como ES modules, justamente
para funcionar via `file://`: navegadores bloqueiam `type="module"` nessa origem.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Shell da página, sprite SVG dos ícones, tema aplicado antes da primeira pintura e ordem de carga dos scripts |
| `styles.css` | Design system (forma, movimento, componentes, responsividade); desenha o tema Aurora |
| `themes.css` | Tokens de cor de cada tema e o que muda na estrutura do Argila (tipografia, superfícies planas) |
| `app.js` | Ações, formulários, modais, rotas, desfazer e atalhos de teclado |
| `modules/state.js` | Estado, persistência, índice derivado e preferências do aparelho |
| `modules/render.js` | Renderização das telas |
| `modules/utils.js` | Helpers, datas relativas e cálculos de frequência |
| `modules/files.js` | Anexos no IndexedDB, abertura e inclusão no backup |
| `modules/theme.js` | Escolha e aplicação do tema, seletor de aparência |
| `modules/palette.js` | Paleta de comandos (busca) e lista de atalhos |

## Temas

Em **Aparência** (barra lateral, menu do celular ou tecla `T`):

- **Aurora**: o visual original, escuro, com vidro e brilho.
- **Argila**: claro, inspirado na linguagem visual da Anthropic: papel marfim, terracota, títulos em serifa (Newsreader) e superfícies planas.
- **Argila noturno**: os mesmos tons para a noite.
- **Automático**: Argila claro ou noturno, conforme o sistema.

A escolha fica no `localStorage` (`meu-semestre-prefs`), fora dos dados e do backup.
A fonte serifada só é baixada quando um tema Argila está ativo.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Ctrl K` ou `/` | Buscar matérias, tarefas, conteúdos (inclusive anotações e nomes de anexos) ou ações |
| `N` | Criar um item na tela atual |
| `1` a `5` | Ir para Início, Matérias, Faltas, Conteúdo, Tarefas |
| `T` | Alternar o tema |
| `Ctrl Z` | Desfazer a última exclusão |
| `?` | Mostrar os atalhos |

## Funcionalidades

- Matérias com cor, total de aulas e limite de faltas (%), mostrando quantas faltas ainda cabem
- Painel da matéria: clique no card para ver as tarefas, os conteúdos e as faltas dela; o lápis abre a edição
- Registro de faltas com aviso ao se aproximar do limite; o registro rápido pode ser desfeito no aviso
- Conteúdos com anotações (links clicáveis), marcação de estudado e anexos (até 10 MB por arquivo),
  que também podem ser arrastados para o formulário ou colados com `Ctrl V` (prints de tela)
- Tarefas, provas e trabalhos com prazo, editáveis, agrupados em Atrasadas, Hoje, Amanhã, Próximos 7 dias,
  Mais adiante e Sem data, com filtro por matéria
- Início com resumo do que pede atenção, agenda dos próximos 7 dias e frequência de todas as matérias
- Exclusões com "Desfazer" (inclusive a de uma matéria inteira, que pede confirmação antes)
- Cada tela tem seu endereço (`#tarefas`, `#materias`…): recarregar, voltar e avançar funcionam
- Backup em JSON (exportar/importar), com lembrete na barra lateral quando o último tem mais de 14 dias
- Interface responsiva: sidebar completa, rail de ícones em tablet e barra inferior em celular
