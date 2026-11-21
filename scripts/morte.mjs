import {atorSolicitante,escapar} from './pedidos.mjs';
/**
 * Parte Morte: ponto de descanso, retorno após a morte, Exaustão pela Morte,
 * Moedas do Destino e Rito da Morte. Também a página "Destino" da ficha.
 */
import { FH, api, parte, falar, botaoChat, confirmar, escolher, pedirGM, registrarAcaoGM, registrarBotao, caminhoFlag, tabelas, sortearFaixa } from "./util.mjs";
import { rolarFobiaRetorno } from "./fobias.mjs";
import { rolarDescobertas, rolarRecompensa } from "./exploracao.mjs";

const LIMITE_MOEDAS = () => api().regra("limiteMoedas", 3);
export const moedas = () => game.settings.get(FH, "moedas");

/* ------------------------------ página Destino --------------------------- */

export async function contextoDestino(ator) {
  const mortes = ator.getFlag(FH, "mortes") ?? 0;
  const limite = api().regra("limiteExaustao");
  const lista = Array.from({ length: LIMITE_MOEDAS() }, (_, i) => ({ n: i + 1, cheio: i < moedas() }));
  return {
    moedas: moedas(), pipsMoedas: lista, limiteMoedas: LIMITE_MOEDAS(), ehGM: game.user.isGM,
    mortes, exaustaoNormal: ator.system.exaustao.value, exaustaoTotal: ator.system.exaustaoTotal, limite,
    retornos: ator.getFlag(FH, "retornos") ?? 0,
    ponto: ator.getFlag(FH, "pontoDescanso") ?? "",
    mostrarMorte: parte("Morte"), mostrarExploracao: parte("Exploracao"),
    glitches: (ator.getFlag(FH, "retornos") ?? 0) >= 3
  };
}

/* ----------------------------- Moedas do Destino ------------------------- */

const saldo = () => { const n=moedas(); if(!Number.isSafeInteger(n)||n<0||n>LIMITE_MOEDAS()) throw Error("Reserva de Moedas do Destino inválida. Confira o valor com o Mestre."); return n; };
const stepMoedas = (delta) => {const before=saldo(),after=Math.max(0,Math.min(LIMITE_MOEDAS(),before+delta));return before===after?[]:[{kind:'coins',before,after}];};
const mensagem = (titulo,texto) => ({data:{content:`<div class="se-flavor"><h3>${titulo}</h3>${texto}</div>`}});
const policyMoedas = {parts:['Morte'],keys:['actorUuid'],approval:true};

async function planoObterMoeda(){
 if(saldo()>=LIMITE_MOEDAS())return {steps:[],events:[mensagem('Moeda do Destino','<p>A reserva está cheia: nenhuma rolagem é feita e nenhuma moeda é obtida.</p>')]};
 const roll=await new Roll('1d100').evaluate(),ok=roll.total<=25;
 return {steps:ok?stepMoedas(1):[],events:[{roll:roll.toJSON(),data:{flavor:`<div class="se-flavor"><h3>Obter Moeda do Destino</h3><p>${ok?'01–25: o grupo obtém uma Moeda do Destino.':'26–100: nenhuma moeda.'}</p><p>Uma única oportunidade por criatura derrotada, confirmada pelo Mestre.</p></div>`}}]};
}
function eventoRito(roll,nome){
 const vitoria=roll.total===1,botoes=vitoria?botaoChat('gastarMoeda','Gastar 1 Moeda do Destino (novo lançamento)'):'';
 return {roll:roll.toJSON(),data:{flags:{[FH]:{rito:{nome:String(nome??'').slice(0,180),vitoria}}},flavor:`<div class="se-flavor"><h3>Rito da Morte${nome?': '+escapar(nome):''}</h3><p>${vitoria?'Vitória da criatura: 4 ações neste turno.':'Derrota da criatura: ela morre imediatamente.'}</p><p>A vitória não mata um personagem automaticamente.</p>${botoes}</div>`}};
}
/** Rito inicial é uma rolagem narrativa; rerrolagem com moeda exige pedido autenticado. */
export async function ritoDaMorte(nome=''){
 if(!parte('Morte'))throw Error('A parte Morte está desativada.');
 const roll=await new Roll('1d2').evaluate(),ev=eventoRito(roll,nome);return roll.toMessage(ev.data);
}
registrarAcaoGM('gastarMoeda',async({messageUuid})=>{
 const m=await fromUuid(messageUuid),rito=m?.flags?.[FH]?.rito;
 if(m?.documentName!=='ChatMessage'||!rito?.vitoria)throw Error('Selecione um cartão de vitória do Rito da Morte criado nesta versão.');
 if(saldo()<1)throw Error('A reserva não tem Moedas do Destino.');
 const roll=await new Roll('1d2').evaluate();return {use:m.uuid,steps:stepMoedas(-1),events:[eventoRito(roll,rito.nome)]};
},{...policyMoedas,keys:['actorUuid','messageUuid'],onceField:'messageUuid'});
registrarAcaoGM('moedas',async({delta})=>{
 if(!Number.isSafeInteger(delta)||![-1,1].includes(delta))throw Error('O ajuste de moedas deve ser +1 ou −1.');
 const steps=stepMoedas(delta);return {steps,events:[mensagem('Moedas do Destino',`<p>Reserva: ${steps[0]?.after??saldo()}/${LIMITE_MOEDAS()}.</p>`)]};
},{...policyMoedas,keys:['actorUuid','delta'],gmOnly:true});
registrarAcaoGM('obterMoeda',planoObterMoeda,policyMoedas);
registrarAcaoGM('moedaAchado',async()=>{
 const cheio=saldo()>=LIMITE_MOEDAS();return {steps:cheio?[]:stepMoedas(1),events:[mensagem('Moeda do Destino',cheio?'<p>A reserva coletiva está cheia: em vez da moeda, o grupo encontra um pergaminho.</p>':`<p>O grupo encontra uma Moeda do Destino. Reserva: ${saldo()+1}/${LIMITE_MOEDAS()}.</p>`)]};
},{...policyMoedas,parts:['Morte','Exploracao']});

/* --------------------------- retorno após a morte ------------------------ */

async function avaliarMorte(ator, causa) {
  const ponto = ator.getFlag(FH, "pontoDescanso");
  const total = ator.system.exaustaoTotal;
  const limite = api().regra("limiteExaustao");
  const motivos = {
    resistencia: "falhou nos testes de morte", exaustao: "atingiu o limite de Exaustão", autossacrificio: "se sacrificou",
    decapitacao: "teve a cabeça destruída", "infeccao-ferimento": "sucumbiu à infecção de ferimento", infeccao: "sucumbiu à infecção"
  };
  const quem = `${ator.name} ${motivos[causa] ?? "morreu"}`;

  if (causa === "exaustao" || total >= limite) {
    return falar(ator, "Morte definitiva", `<p class="se-resultado falha">${quem}. Com ${total} níveis totais de Exaustão, a morte é definitiva e não há retorno.</p>`);
  }
  if (!ponto) {
    return falar(ator, "Morte definitiva", `<p class="se-resultado falha">${quem}, mas não possui ponto de descanso registrado: não pode retornar.</p>`);
  }
  if (total + 1 >= limite) {
    return falar(ator, "Morte definitiva", `<p class="se-resultado falha">${quem}. O retorno acrescentaria o ${limite}º nível de Exaustão: a morte é definitiva.</p>`);
  }
  return falar(ator, "Morte",
    `<p>${quem}. Após a resolução da cena, retorna a <strong>${ponto}</strong> com 1 PV e +1 nível de Exaustão pela Morte (total ${total + 1}/${limite}). Equipamentos permanecem no local.</p>`,
    botaoChat("retorno", "Resolver o retorno", { actor: ator.uuid }));
}

export async function retornar(ator) {
  const mortes = (ator.getFlag(FH, "mortes") ?? 0) + 1;
  const retornos = (ator.getFlag(FH, "retornos") ?? 0) + 1;
  const dados = {
    "system.pv.value": 1, "system.condicoes.incapacitado": false, "system.morte.sucessos": 0, "system.morte.fracassos": 0,
    [caminhoFlag("mortes")]: mortes, [caminhoFlag("retornos")]: retornos, [caminhoFlag("ataquesTurno")]: 0
  };
  // Morrer pela fase crítica da infecção devolve o personagem na mesma fase, com nova hora de tratamento.
  const inf = ator.getFlag(FH, "infeccao");
  if (inf?.estagio === "critica") dados[caminhoFlag("infeccao")] = { ...inf, contagem: 0 };
  await ator.update(dados, { seSemCaido: true });

  await falar(ator, "Retorno",
    `<p>${ator.name} retorna a <strong>${ator.getFlag(FH, "pontoDescanso")}</strong> com 1 PV. Exaustão pela Morte: <strong>${mortes}</strong> (total ${ator.system.exaustaoTotal}/${api().regra("limiteExaustao")}). Ferimentos, mutilações, doenças e condições permanecem; a reconstituição só repara o necessário para voltar à vida.</p>`);
  if (parte("Fobias")) await rolarFobiaRetorno(ator);
  if (retornos >= 3) {
    await falar(ator, "Segredos e Glitches",
      `<p>${ator.name} já completou ${retornos} retornos e pode tentar descobrir um glitch: Inteligência CD 14, sem custo de ação.</p>`,
      botaoChat("glitch", "Teste de Conhecimento (INT CD 14)", { actor: ator.uuid }));
  }
}

/* -------------------------------- registro ------------------------------- */

export function registrarMorte(apiSE) {
  apiSE.registrarAcoes("fh-destino", {
    obterMoeda: ({ator}) => pedirGM("obterMoeda",{actorUuid:ator.uuid}),
    moedaMais: ({ator}) => pedirGM("moedas", { delta: 1,actorUuid:ator.uuid }),
    moedaMenos: ({ator}) => pedirGM("moedas", { delta: -1,actorUuid:ator.uuid }),
    rito: () => ritoDaMorte(""),
    descobertas: ({ator}) => rolarDescobertas(ator),
    recompensa: () => rolarRecompensa(),
    async retornoManual({ ator }) {
      if (!ator.getFlag(FH, "pontoDescanso")) return ui.notifications.warn("Registre um ponto de descanso antes.");
      if (await confirmar("Retorno", `<p>Retornar ${ator.name} ao ponto de descanso (1 PV, +1 Exaustão pela Morte)?</p>`)) await retornar(ator);
    },
    async removerMorte({ ator }) {
      const m = ator.getFlag(FH, "mortes") ?? 0;
      if (m > 0 && await confirmar("Exaustão pela Morte", "<p>Remover 1 nível de Exaustão pela Morte (somente por Elixir da Saúde, Pergaminho da Vitalidade ou recurso que declare essa capacidade)?</p>")) {
        await ator.setFlag(FH, "mortes", m - 1);
      }
    }
  });

  registrarBotao("retorno", async ({ dados }) => {
    const ator = await fromUuid(dados.actor);
    if (!ator) return;
    if (!game.user.isGM && !ator.isOwner) return ui.notifications.warn("Apenas o Mestre ou o dono do personagem pode resolver o retorno.");
    await retornar(ator);
  });

  registrarBotao("gastarMoeda", async ({ mensagem }) => { const ator=atorSolicitante();await pedirGM("gastarMoeda", {messageUuid:mensagem.uuid,...(ator?{actorUuid:ator.uuid}:{})}); });

  registrarBotao("glitch", async ({ dados }) => {
    const ator = await fromUuid(dados.actor);
    if (!ator?.isOwner && !game.user.isGM) return;
    const roll = await ator.rolarTeste({ chave: "int", rotulo: "Conhecimento de glitches (INT CD 14)", cd: 14 });
    if (roll.total >= 14) await falar(ator, "Glitch descoberto", "<p>O Mestre revela um segredo desconhecido: procedimento, requisitos, efeito exato e limites. Outra tentativa exige um novo retorno.</p>");
  });
}

export function ganchosMorte() {
  // Níveis de Exaustão pela Morte somam-se à Exaustão normal.
  Hooks.on("sangueEscuro.exaustaoExtra", (ator, ctx) => {
    if (parte("Morte")) ctx.extra += ator.getFlag(FH, "mortes") ?? 0;
  });

  Hooks.on("sangueEscuro.morreu", (ator, { causa }) => {
    if (!parte("Morte") || ator.type !== "character") return;
    avaliarMorte(ator, causa);
  });
}
