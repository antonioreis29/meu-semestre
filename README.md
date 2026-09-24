# Meu Semestre

Controle acadêmico de semestre: matérias, faltas, conteúdos estudados e tarefas/provas.

Aplicação estática em JavaScript puro, sem build e sem dependências.
Os dados ficam no `localStorage` do navegador, com exportação e importação de backup em JSON.
Os anexos dos conteúdos ficam no IndexedDB do mesmo navegador e entram no backup.

## Como rodar

Basta abrir o `index.html` no navegador (duplo-clique funciona).

Os scripts são carregados como scripts clássicos, e não como ES modules, justamente
para funcionar via `file://`: navegadores bloqueiam `type="module"` nessa origem.

## Testes

```sh
node --test
```

Roda os testes de `tests/` no Node 20 ou mais novo, sem instalar nada. Eles carregam os
mesmos scripts do app com um `localStorage` em memória, então não tocam nos dados do
navegador, e cobrem datas, frequência, a regra de aprovação, validação e migração dos dados, desfazer,
busca, rotas e a exportação da agenda.

## Estrutura

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Shell da página, sprite SVG dos ícones, tema aplicado antes da primeira pintura e ordem de carga dos scripts |
| `styles.css` | Design system (forma, movimento, componentes, responsividade); desenha o tema Aurora |
| `themes.css` | Tokens de cor de cada tema e o que muda na estrutura do Argila (tipografia, superfícies planas) |
| `app.js` | Ações, formulários, modais, rotas, desfazer, backup e atalhos de teclado |
| `modules/state.js` | Estado, validação, versões e migrações dos dados, persistência, índice derivado e preferências do aparelho |
| `modules/render.js` | Renderização das telas |
| `modules/utils.js` | Helpers, datas relativas, cálculos de frequência, grade horária e regra de aprovação (P1, P2 e final) |
| `modules/files.js` | Anexos no IndexedDB, abertura e inclusão no backup |
| `modules/theme.js` | Escolha e aplicação do tema, seletor de aparência |
| `modules/palette.js` | Paleta de comandos (busca) e lista de atalhos |
| `modules/calendar.js` | Exportação das tarefas para agenda (`.ics`) |
| `modules/semesters.js` | Encerrar, reabrir e renomear semestres |
| `tests/` | Testes automatizados (`node --test`) |

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
- Grade horária opcional (aulas por dia da semana): "Falta hoje" registra todas as aulas do dia
  e o Início diz quais matérias têm aula hoje
- Notas lançadas no painel da matéria (P1, P2 e prova final, de 0 a 10). Média (P1 + P2) ÷ 2 de 7 ou mais
  aprova direto; abaixo disso vai para a prova final, onde (média + final) ÷ 2 precisa chegar a 5.
  O painel diz quanto falta tirar, e o card da matéria mostra o resultado
- Painel da matéria: clique no card para ver as tarefas, os conteúdos e as faltas dela; o lápis abre a edição
- Registro de faltas com aviso ao se aproximar do limite; o registro rápido pode ser desfeito no aviso
- Conteúdos com anotações (links clicáveis), marcação de estudado e anexos (até 10 MB por arquivo),
  que também podem ser arrastados para o formulário ou colados com `Ctrl V` (prints de tela);
  os já estudados ficam recolhidos no fim da lista
- Tarefas, provas e trabalhos com prazo, editáveis, agrupados em Atrasadas, Hoje, Amanhã, Próximos 7 dias,
  Mais adiante e Sem data, com filtro por matéria
- Exportação das tarefas pendentes com data para Google Agenda, Outlook ou celular (`.ics`);
  importar de novo atualiza os eventos em vez de duplicá-los
- Semestres: ao encerrar um, tudo vai para o arquivo e o app começa vazio para o próximo;
  semestres arquivados podem ser reabertos ou excluídos
- Início com resumo do que pede atenção, agenda dos próximos 7 dias e frequência de todas as matérias
- Exclusões com "Desfazer" (inclusive a de uma matéria inteira, que pede confirmação antes)
- Cada tela tem seu endereço (`#tarefas`, `#materias`…): recarregar, voltar e avançar funcionam
- Backup em JSON (exportar/importar), com lembrete na barra lateral quando o último tem mais de 14 dias
- Interface responsiva: sidebar completa, rail de ícones em tablet e barra inferior em celular
- Acessível pelo teclado: diálogos prendem o foco, e a cor da matéria é escolhida com as setas

## Dados

- Tudo o que é carregado, do navegador ou de um backup, passa por uma validação (`sanitizeState`):
  campos que faltam ganham valores padrão, e registros sem conserto (sem id, sem matéria, sem data)
  são descartados e contados. Um backup adulterado não consegue injetar HTML na página.
- Importar um backup mostra o que ele traz e pede confirmação antes de substituir os dados atuais,
  e dá para desfazer logo em seguida.
- Os dados têm versão (`version`). Quando o formato muda, um passo em `MIGRATIONS` leva os dados
  antigos para a versão nova; backups de uma versão mais nova do app são recusados.
- Se o que está salvo não puder ser lido, uma cópia fica guardada em `meu-semestre-v1-ilegivel-<data>`
  antes de qualquer gravação nova.
- Se o navegador não conseguir salvar (armazenamento cheio ou bloqueado), um aviso oferece exportar o backup.
- Com o app aberto em duas abas, uma vê o que a outra salvou, em vez de sobrescrever.
