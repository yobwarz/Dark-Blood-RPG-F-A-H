import {escapar} from './pedidos.mjs';
/**
 * Parte Combate: limite de dois ataques, Esquiva, conceder ação, Autossacrifício,
 * ataques letais contra partes do corpo, limites de mutilação e reação ao ataque letal.
 */
import { FH, api, parte, adulto, falar, botaoChat, confirmar, escolher, pedirGM, registrarAcaoGM, registrarBotao, caminhoFlag } from "./util.mjs";

/** Anatomia padrão de um personagem humano (referência inicial do documento). */
export const PARTES_HUMANAS = [
  { nome: "Cabeça", limite: 8, destruida: false },
  { nome: "Braço direito", limite: 5, destruida: false },
  { nome: "Braço esquerdo", limite: 5, destruida: false },
  { nome: "Perna direita", limite: 6, destruida: false },
  { nome: "Perna esquerda", limite: 6, destruida: false }
];

const ehCabeca = (nome) => /cabe[çc]a|cr[âa]nio/i.test(nome ?? "");
const consequenciaPadrao = (nome) => {
  if (ehCabeca(nome)) return "Morte imediata.";
  if (/bra[çc]o/i.test(nome)) return "Perde o uso do braço: não realiza ataques nem atividades que dependam dele (inclui armas de duas mãos).";
  if (/perna/i.test(nome)) return "Uma perna perdida reduz o deslocamento à metade; ambas impedem caminhar (a criatura fica Caída e se arrasta 1,5 m por turno).";
  return "Consequência conforme a anatomia descrita na ficha.";
};

export const anatomiaDe = (ator) => foundry.utils.deepClone(ator.getFlag(FH, "anatomia") ?? []);

/** Partes atacáveis de um ator (humanas para personagens; da ficha para criaturas). */
function partesDe(ator) {
  if (ator?.type === "criatura") return anatomiaDe(ator);
  const mutiladas = ator?.getFlag(FH, "mutilado") ?? [];
  return PARTES_HUMANAS.map((p) => ({ ...p, destruida: mutiladas.includes(p.nome) }));
}

const limiteAtaques = (ator) => (ator.system.condicoes?.uniaoCarne ? 3 : api().regra("maxAtaquesPorTurno"));
const permiteLetal = (item) => (item?.getFlag(FH, "letal") ?? "sim") !== "nao";

/* -------------------------------------------------------------------------- */
/*  Painel na aba Combate                                                     */
/* -------------------------------------------------------------------------- */

export async function contextoCombate(ator) {
  const alvo = game.user.targets.first()?.actor;
  const lista = partesDe(alvo);
  const decl = ator.getFlag(FH, "declaracao") ?? { letal: false, parte: "" };
  const opPartes = { "": lista.length ? "(escolha a parte)" : "(selecione um alvo)" };
  for (const p of lista) opPartes[p.nome] = `${p.nome} (limite ${p.limite})${p.destruida ? " — destruída" : ""}`;
  return {
    ataques: ator.getFlag(FH, "ataquesTurno") ?? 0,
    maxAtaques: limiteAtaques(ator),
    letal: !!decl.letal,
    parteSel: decl.parte ?? "",
    opPartes,
    alvoNome: alvo?.name ?? "nenhum alvo selecionado",
    esquiva: !!ator.system.condicoes?.esquiva,
    mutiladas: ator.getFlag(FH, "mutilado") ?? [],
    uniao: !!ator.system.condicoes?.uniaoCarne
  };
}

/* -------------------------------------------------------------------------- */
/*  Ações dos botões                                                          */
/* -------------------------------------------------------------------------- */

export function registrarCombate(apiSE) {
  apiSE.registrarAcoes("fh-combate", {
    async esquiva({ ator }) {
      if (ator.system.condicoes.esquiva) return ui.notifications.info("O personagem já está em Esquiva.");
      await ator.gastarAcoes(1);
      await ator.update({ "system.condicoes.esquiva": true });
      falar(ator, "Esquiva", `<p>${ator.name} assume uma postura defensiva até o início do próximo turno: os ataques contra ele têm <strong>Desvantagem</strong> (se perceber o atacante e puder se mover). Não acumula.</p>`);
    },

    async conceder({ ator }) {
      const aliados = (game.combat?.combatants ?? []).map((c) => c.actor).filter((a) => a?.type === "character" && a.id !== ator.id);
      if (!aliados.length) return ui.notifications.warn("Nenhum aliado no combate para receber a ação.");
      const id = await escolher("Conceder uma ação", aliados.map((a) => ({ id: a.uuid, label: a.name })), "<p>Quem recebe a ação imediata?</p>");
      if (!id) return;
      await pedirGM("concederAcao", { uuid: id, de: ator.uuid,combatId:game.combat?.id,round:game.combat?.round,turn:game.combat?.turn });
    },

    async autossacrificio({ ator }) {
      const ok = await confirmar("Autossacrifício",
        `<p>${ator.name} realiza um ataque letal contra si mesmo (1 ação, conta para o limite de ataques). PV vão a <strong>0</strong> e o personagem morre sem testes de morte, retornando ao último ponto de descanso.</p>`);
      if (!ok) return;
      await ator.gastarAcoes(1);
      await ator.setFlag(FH, "ataquesTurno", (ator.getFlag(FH, "ataquesTurno") ?? 0) + 1);
      await ator.update({ "system.pv.value": 0, "system.condicoes.incapacitado": true }, { seSemCaido: true });
      await falar(ator, "Autossacrifício", `<p>${ator.name} encerra a própria vida. Sem jogada de ataque, sem NA, PR ou reduções.</p>`);
      Hooks.callAll("sangueEscuro.morreu", ator, { causa: "autossacrificio" });
    },

    async restaurarParte({ ator, alvo }) {
      const nome = alvo.dataset.parte;
      const lista = (ator.getFlag(FH, "mutilado") ?? []).filter((n) => n !== nome);
      await ator.setFlag(FH, "mutilado", lista);
    }
  });

  const validarConcessao=async(d,{actor:origem})=>{
    const c=game.combat,aliado=await fromUuid(d.uuid);
    if(!c?.started||c.id!==d.combatId||c.round!==d.round||c.turn!==d.turn)throw Error('O combate ou turno deste pedido mudou.');
    const participantes=Array.from(c.combatants?.contents??c.combatants??[]);
    if(!origem||aliado?.documentName!=='Actor'||aliado.type!=='character'||aliado.uuid===origem.uuid||![origem,aliado].every(a=>participantes.some(p=>p.actor?.uuid===a.uuid)))throw Error('Origem e aliado devem ser personagens distintos no mesmo combate.');
    if(c.combatant?.actor?.uuid!==origem.uuid)throw Error('A concessão deve ser feita no turno da origem.');
    if(origem.system.condicoes?.incapacitado||origem.flags?.['sangue-escuro']?.morto||origem.flags?.[FH]?.morto||origem.podeAgir?.()===false)throw Error('O personagem de origem não pode agir.');
    if(aliado.system.condicoes?.incapacitado||aliado.flags?.['sangue-escuro']?.morto||aliado.podeAgir?.()===false)throw Error('O aliado não pode receber uma ação imediata.');
    if(!Number.isSafeInteger(origem.system.turno?.acoes)||origem.system.turno.acoes<1||!Number.isSafeInteger(aliado.system.turno?.acoes)||aliado.system.turno.acoes<0||!Number.isSafeInteger(aliado.system.turno.acoes+1))throw Error('Ações insuficientes ou contadores inválidos.');
    return aliado;
  };
  registrarAcaoGM('concederAcao',async(d,ctx)=>{
    const origem=ctx.actor,aliado=await validarConcessao(d,ctx);
    return {combat:{id:d.combatId,round:d.round,turn:d.turn},steps:[
      {kind:'actor',uuid:origem.uuid,before:{'system.turno.acoes':origem.system.turno.acoes},after:{'system.turno.acoes':origem.system.turno.acoes-1}},
      {kind:'actor',uuid:aliado.uuid,before:{'system.turno.acoes':aliado.system.turno.acoes},after:{'system.turno.acoes':aliado.system.turno.acoes+1}}
    ],events:[{data:{content:`<div class="se-flavor"><h3>Ação concedida</h3><p>${escapar(origem.name)} concede uma ação a ${escapar(aliado.name)}. Somente essa ação, sem novo turno nem recuperação de reação. Não pode ser usada para conceder outra ação e conta para o limite de ataques.</p></div>`}}]};
  },{parts:['Combate'],actorKey:'de',keys:['de','uuid','combatId','round','turn'],validate:validarConcessao});

  registrarBotao("usarReacao", async ({ dados }) => {
    const ator = await fromUuid(dados.actor);
    if (!ator?.isOwner && !game.user.isGM) return ui.notifications.warn("Você não controla este personagem.");
    if (ator.system.turno.reacao <= 0) return ui.notifications.warn("A reação já foi gasta.");
    await ator.update({ "system.turno.reacao": 0 });
    falar(ator, "Contra-ataque", `<p>${ator.name} gasta a reação para atacar o agressor. A reação não consome as ações do próximo turno.</p>`);
  });
}

/* -------------------------------------------------------------------------- */
/*  Ganchos de regras                                                         */
/* -------------------------------------------------------------------------- */

const ultimoLetal = new Map();   // ataque letal que acertou, à espera da rolagem de dano

export function ganchosCombate() {
  // Limite de ataques e arma sem ataque letal.
  Hooks.on("sangueEscuro.preAtaque", (ator, item) => {
    if (!parte("Combate") || ator.type !== "character") return;
    const max = limiteAtaques(ator);
    if (game.combat?.started && (ator.getFlag(FH, "ataquesTurno") ?? 0) >= max) {
      ui.notifications.warn(`${ator.name} já realizou ${max} ataques neste turno (limite de ataques).`);
      return false;
    }
    const decl = ator.getFlag(FH, "declaracao");
    if (decl?.letal && !permiteLetal(item)) {
      ui.notifications.warn(`${item.name} não permite ataques letais. Desmarque “Ataque letal” ou troque de arma.`);
      return false;
    }
    if (decl?.letal && !decl.parte) {
      ui.notifications.warn("Escolha a parte do corpo do ataque letal.");
      return false;
    }
  });

  // Esquiva e cabeça: Desvantagem. Fobia ativa: +2 para acertar.
  Hooks.on("sangueEscuro.penalidades", (ator, resultado, ctx) => {
    if (!parte("Combate") || ctx.tipo !== "ataque") return;
    const alvo = ctx.alvo;
    if (alvo?.system?.condicoes?.esquiva) resultado.desvantagem = true;
    const decl = ator.getFlag?.(FH, "declaracao");
    if (decl?.letal && ehCabeca(decl.parte) && alvo) {
      const livre = ["agarrado", "contido", "caido", "incapacitado"].some((c) => alvo.system?.condicoes?.[c]);
      if (!livre) resultado.desvantagem = true;
    }
  });

  // Contabiliza o ataque; guarda o ataque letal que acertou.
  Hooks.on("sangueEscuro.ataque", async (ator, item, d) => {
    if (!parte("Combate") || ator.type !== "character" || d.repetido) return;
    ultimoLetal.delete(ator.id);
    await ator.setFlag(FH, "ataquesTurno", (ator.getFlag(FH, "ataquesTurno") ?? 0) + 1);
    const decl = ator.getFlag(FH, "declaracao");
    if (decl?.letal) {
      if (d.acertou) ultimoLetal.set(ator.id, { parte: decl.parte });
      await ator.setFlag(FH, "declaracao", { letal: false, parte: decl.parte });
    }
  });

  // Anexa a parte atacada ao cartão de dano.
  Hooks.on("sangueEscuro.preDano", (ator, item, dados) => {
    if (!parte("Combate")) return;
    const l = ultimoLetal.get(ator.id);
    if (l) { dados.fh = { letal: true, parte: l.parte }; ultimoLetal.delete(ator.id); }
  });

  // Início do turno: zera ataques, encerra Esquiva, Hemorragia Grave e União da Carne.
  Hooks.on("sangueEscuro.inicioTurno", async (ator) => {
    if (!game.users.activeGM?.isSelf || !parte("Combate") || !ator?.system?.condicoes) return;
    const dados = {};
    if ((ator.getFlag(FH, "ataquesTurno") ?? 0) !== 0) dados[caminhoFlag("ataquesTurno")] = 0;
    if (ator.system.condicoes.esquiva) dados["system.condicoes.esquiva"] = false;
    if (ator.type === "character" && ator.system.condicoes.uniaoCarne && adulto()) dados["system.turno.acoes"] = 4;
    if (Object.keys(dados).length) await ator.update(dados);

    if (ator.system.condicoes.hemorragiaGrave && parte("Fobias")) {
      const novo = Math.max(0, ator.system.pv.value - 2);
      await ator.update({ "system.pv.value": novo });
      falar(ator, "Hemorragia Grave", `<p>${ator.name} sofre 2 de dano. PV ${novo}/${ator.system.pv.max}. Tratamento: 1 ação, Medicina CD 14 e um uso de conjunto de tratamento (reduz para Sangramento).</p>`);
    }
  });

  // Resolve mutilação quando o módulo de combate aplica o dano de um ataque letal.
  Hooks.on("sangueEscuroCombate.danoAplicado", (alvo, { dados, dano }) => {
    if (!parte("Combate") || !dados?.fh?.letal) return;
    resolverMutilacao(alvo, dados, dano);
  });

  // União da Carne (conteúdo adulto): +4 PV máximos.
  Hooks.on("sangueEscuro.derivar", (ator) => {
    if (ator.type === "character" && adulto() && ator.system.condicoes?.uniaoCarne) ator.system.pv.max += 4;
  });
}

/** Resolve o resultado de um ataque letal contra uma parte do corpo. */
export async function resolverMutilacao(alvo, dados, danoFinal) {
  const nome = dados.fh.parte;
  const humano = alvo.type === "character";
  const lista = partesDe(alvo);
  const p = lista.find((x) => x.nome === nome);
  if (!p) return falar(alvo, "Ataque letal", `<p>${alvo.name} não possui a parte “${nome}”.</p>`);
  if (p.destruida) return falar(alvo, "Ataque letal", `<p>${nome} de ${alvo.name} já está destruída.</p>`);

  if (danoFinal >= p.limite) {
    if (humano) await alvo.setFlag(FH, "mutilado", [...(alvo.getFlag(FH, "mutilado") ?? []), nome]);
    else {
      const anat = anatomiaDe(alvo);
      anat.find((x) => x.nome === nome).destruida = true;
      await alvo.setFlag(FH, "anatomia", anat);
    }
    const vital = ehCabeca(nome);
    const consequencia = p.consequencia ?? consequenciaPadrao(nome);
    await falar(alvo, "Parte destruída",
      `<p><strong>${nome}</strong> de ${alvo.name} é destruída: dano ${danoFinal} ≥ limite ${p.limite} (já depois da PR).</p><p class="se-nota">${consequencia}</p>${vital ? '<p class="se-resultado falha">Morte imediata.</p>' : ""}`);
    if (vital) {
      await alvo.update({ "system.pv.value": 0 }, { seSemCaido: true });
      if (humano) Hooks.callAll("sangueEscuro.morreu", alvo, { causa: "decapitacao" });
      return;
    }
  } else {
    await falar(alvo, "Ataque letal", `<p>Dano ${danoFinal} abaixo do limite ${p.limite}: <strong>${nome}</strong> de ${alvo.name} não é destruída. O dano reduz apenas os PV gerais.</p>`);
  }

  // Reação ao ataque letal (depois da aplicação do dano e da mutilação).
  if (alvo.system.pv.value > 0) {
    const reacao = alvo.type === "character" ? alvo.system.turno.reacao > 0 : true;
    if (reacao) {
      await falar(alvo, "Reação ao ataque letal",
        `<p>${alvo.name} sobreviveu e pode gastar a <strong>reação</strong> para atacar o agressor, desde que o alcance e conserve a parte necessária.</p>`,
        alvo.type === "character" ? botaoChat("usarReacao", "Gastar a reação", { actor: alvo.uuid }) : "");
    }
  }
}
