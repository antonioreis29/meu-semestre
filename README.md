# Meu Semestre

Controle acadêmico de semestre: matérias, faltas, conteúdos estudados e tarefas/provas.

Aplicação estática em JavaScript puro, sem build e sem dependências.
Os dados ficam no `localStorage` do navegador, com exportação e importação de backup em JSON.

## Como rodar

Basta abrir o `index.html` no navegador (duplo-clique funciona).

Os scripts são carregados como scripts clássicos, e não como ES modules, justamente
para funcionar via `file://`: navegadores bloqueiam `type="module"` nessa origem.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Shell da página, sprite SVG dos ícones e ordem de carga dos scripts |
| `styles.css` | Design system (tokens, componentes, responsividade) |
| `app.js` | Ações, formulários e modais |
| `modules/state.js` | Estado e persistência |
| `modules/render.js` | Renderização das telas |
| `modules/utils.js` | Helpers e cálculos de frequência |

## Funcionalidades

- Matérias com cor, total de aulas e limite de faltas (%)
- Painel da matéria: clique no card para ver as tarefas e os conteúdos dela; o lápis abre a edição
- Registro de faltas com aviso ao se aproximar do limite
- Conteúdos com anotações e marcação de estudado
- Tarefas e provas com prazo e destaque de atraso
- Backup em JSON (exportar/importar)
- Interface responsiva: sidebar completa, rail de ícones em tablet e barra inferior em celular
