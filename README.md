# Meu Semestre

Controle acadêmico de semestre: matérias, faltas, conteúdos estudados e tarefas/provas.

Aplicação estática em JavaScript puro (ES modules), sem build e sem dependências.
Os dados ficam no `localStorage` do navegador, com exportação e importação de backup em JSON.

## Como rodar

Por usar ES modules, precisa ser servido por HTTP (abrir o arquivo direto via `file://` não funciona):

```bash
python -m http.server 8000
# abra http://localhost:8000
```

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Shell da página e sprite SVG dos ícones |
| `styles.css` | Design system (tokens, componentes, responsividade) |
| `app.mjs` | Ações, formulários e modais |
| `modules/state.mjs` | Estado e persistência |
| `modules/render.mjs` | Renderização das telas |
| `modules/utils.mjs` | Helpers e cálculos de frequência |

## Funcionalidades

- Matérias com cor, total de aulas e limite de faltas (%)
- Registro de faltas com aviso ao se aproximar do limite
- Conteúdos com anotações e marcação de estudado
- Tarefas e provas com prazo e destaque de atraso
- Backup em JSON (exportar/importar)
- Interface responsiva: sidebar completa, rail de ícones em tablet e barra inferior em celular
