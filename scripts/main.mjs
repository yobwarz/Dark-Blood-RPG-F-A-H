import {instalarPedidos,abrirConferencia} from './pedidos.mjs';
import {registrarIconesItens,corrigirIconesItens} from './icones-itens.mjs';
import { FH, CENARIO, ativo, parte, adulto, instalarBotoesChat } from "./util.mjs";
import { registrarCombate, ganchosCombate, contextoCombate } from "./combate.mjs";
import { registrarMorte, ganchosMorte, contextoDestino } from "./morte.mjs";
import { registrarFobias, ganchosFobias, contextoFobias } from "./fobias.mjs";
import { registrarMagia, ganchosMagia, contextoMagia } from "./magia.mjs";
import { registrarExploracao, contextoConsumiveis } from "./exploracao.mjs";
import { registrarCriatura, contextoCriatura } from "./criatura.mjs";

const T = `modules/${FH}/templates`;

/* ------------------------- configurações (por parte) --------------------- */
Hooks.once("init", () => {
  if (game.system.id !== "sangue-escuro") return;

  registrarIconesItens();
  class PedidosFH extends foundry.applications.api.ApplicationV2 {async render(){await abrirConferencia();return this;}}
  game.settings.registerMenu(FH,'conferirPedidos',{name:'Pedidos autenticados FH',label:'Conferir pedidos',icon:'fas fa-receipt',type:PedidosFH,restricted:true});
  game.settings.register(FH, "bancoPedidos", {scope:"world",config:false,type:String,default:""});

  const parteConfig = (chave, nome, hint) => game.settings.register(FH, chave, {
    name: nome, hint, scope: "world", config: true, type: Boolean, default: true
  });
  parteConfig("parteCombate", "Parte: Combate, Mutilação e Esquiva",
    "Limite de 2 ataques, Esquiva (Desvantagem), conceder ação, ataques letais com limites de mutilação, reação ao ataque letal e Autossacrifício.");
  parteConfig("parteMorte", "Parte: Morte, Retorno, Moedas do Destino e Rito da Morte",
    "Ponto de descanso, retorno após a morte, Exaustão pela Morte, Moedas do Destino e o Rito da Morte.");
  parteConfig("parteExploracao", "Parte: Exploração e Consumíveis",
    "Tabelas de descobertas e achados, recompensas de criaturas e uso de consumíveis (ervas, bandagens, Elixir da Saúde...).");
  parteConfig("parteMagia", "Parte: Magia, Pergaminhos e Pactos",
    "Conjuração por magias aprendidas e pergaminhos, e a lista de pactos e sacrifícios permanentes.");
  parteConfig("parteFobias", "Parte: Fobias, Condições e Infecção de Ferimento",
    "Fobias (aquisição, ativação e controle), condições da expansão e a infecção progressiva de ferimento.");
  game.settings.register(FH, "conteudoAdulto", {
    name: "Conteúdo adicional de teor adulto (18+)",
    hint: "Libera as seções de União da Carne, Lesões Íntimas, Dependência e Abstinência e a consequência adicional da derrota total. Desativado por padrão. Depois de ativar, recarregue o mundo e use “Criar compêndios” para importar as páginas.",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  game.settings.register(FH, "moedas", { scope: "world", config: false, type: Number, default: 0 });
});

/* ---------------------- registro na API do sistema ----------------------- */
Hooks.once("sangueEscuro.api", (api) => {
  api.registrarCenario({
    id: CENARIO, nome: "Fear & Hunger (Expansão)", modulo: FH,
    descricao: "Limite de 2 ataques, mutilação, retorno da morte, magia, pactos e fobias."
  });
  api.definirRegras(CENARIO, { maxAtaquesPorTurno: 2, limiteMoedas: 3 });

  // Condições (só aparecem com o cenário ativo; as adultas, também só com o conteúdo liberado).
  const cond = (chave, nome, visivel = ativo) => api.registrarCondicao(chave, nome, { visivel });
  cond("esquiva", "Esquiva");
  cond("hemorragiaGrave", "Hemorragia Grave");
  cond("infeccaoMembro", "Infecção de Membro");
  cond("necrose", "Necrose");
  cond("parasitado", "Parasitado");
  cond("envenenado", "Envenenado");
  cond("semOlfato", "Sem Olfato");
  cond("mudo", "Mudo");
  cond("aterrorizado", "Aterrorizado");
  cond("confuso", "Confuso");
  cond("dependencia", "Dependência", adulto);
  cond("abstinencia", "Abstinência", adulto);
  cond("uniaoCarne", "União da Carne", adulto);

  // Categorias de equipamento do cenário.
  api.registrarCategoriaEquipamento("pergaminho", { nome: "Pergaminhos", porCompartimento: 3 });

  // Páginas e painéis.
  api.registrarPagina({
    id: "fh-destino", nome: "Destino", ordem: 200, cenario: CENARIO, visivel: () => parte("Morte") || parte("Exploracao"),
    template: `${T}/destino.hbs`, contexto: contextoDestino
  });
  api.registrarPagina({
    id: "fh-magia", nome: "Magia", ordem: 210, cenario: CENARIO, visivel: () => parte("Magia"),
    template: `${T}/magia.hbs`, contexto: contextoMagia
  });
  api.registrarPainel({ id: "fh-combate", pagina: "combate", cenario: CENARIO, visivel: () => parte("Combate"), template: `${T}/painel-combate.hbs`, contexto: contextoCombate });
  api.registrarPainel({ id: "fh-fobias", pagina: "condicoes", cenario: CENARIO, visivel: () => parte("Fobias"), template: `${T}/painel-fobias.hbs`, contexto: contextoFobias });
  api.registrarPainel({ id: "fh-consumiveis", pagina: "inventario", cenario: CENARIO, visivel: () => parte("Exploracao"), template: `${T}/painel-consumiveis.hbs`, contexto: contextoConsumiveis });
  api.registrarPainel({ id: "fh-criatura", pagina: "criatura", cenario: CENARIO, visivel: () => parte("Combate"), template: `${T}/painel-criatura.hbs`, contexto: contextoCriatura });

  // Ações dos botões das páginas e painéis.
  registrarCombate(api);
  registrarMorte(api);
  registrarFobias(api);
  registrarMagia(api);
  registrarExploracao(api);
  registrarCriatura(api);

  // Conteúdo dos compêndios.
  api.registrarConteudo({
    id: "fh", rotulo: "Fear & Hunger", cenario: CENARIO,
    regras: `modules/${FH}/data/regras.json`, itens: `modules/${FH}/data/itens.json`, atores: `modules/${FH}/data/criaturas.json`
  });
  api.registrarConteudo({
    id: "fh-adulto", rotulo: "Fear & Hunger (18+)", regras: `modules/${FH}/data/regras-adulto.json`,
    condicao: () => game.settings.get(FH, "conteudoAdulto")
  });
});

/* ------------------------------- ganchos --------------------------------- */
Hooks.once("ready", async () => {
  if (game.system.id !== "sangue-escuro") return;
  instalarPedidos();
  instalarBotoesChat();
  ganchosCombate();
  ganchosMorte();
  ganchosFobias();
  ganchosMagia();
  await corrigirIconesItens();
});
