/** Utilitários compartilhados do módulo Fear & Hunger. */
export const FH = "sangue-escuro-fear-and-hunger";
export const CENARIO = "fear-and-hunger";
export const CANAL = `module.${FH}`;

export const api = () => game.sangueEscuro.api;
/** O cenário Fear & Hunger está ativo neste mundo? */
export const ativo = () => api().cenarioEh(CENARIO);
/** Uma parte do módulo (Combate, Morte, Exploracao, Magia, Fobias) está ligada? */
export const parte = (nome) => ativo() && game.settings.get(FH, `parte${nome}`);
/** Conteúdo adicional de teor adulto liberado pelo Mestre? */
export const adulto = () => ativo() && game.settings.get(FH, "conteudoAdulto");

export const flag = (doc, chave, padrao = undefined) => doc.getFlag(FH, chave) ?? padrao;
export const caminhoFlag = (chave) => `flags.${FH}.${chave}`;

export function falar(ator, titulo, corpo, botoes = "") {
  return ChatMessage.create({
    speaker: ator ? ChatMessage.getSpeaker({ actor: ator }) : undefined,
    content: `<div class="se-flavor"><h3>${titulo}</h3>${corpo}${botoes ? `<div class="se-botoes">${botoes}</div>` : ""}</div>`
  });
}

export const botaoChat = (acao, rotulo, dados = {}) =>
  `<button type="button" data-fh="${acao}" ${Object.entries(dados).map(([k, v]) => `data-${k}="${String(v).replace(/"/g, "&quot;")}"`).join(" ")}>${rotulo}</button>`;

/* ----------------------------- janelas ----------------------------------- */

const DV2 = () => foundry.applications.api.DialogV2;

export async function escolher(titulo, opcoes, conteudo = "") {
  return DV2().wait({
    window: { title: titulo }, content: conteudo, rejectClose: false,
    buttons: opcoes.map((o, i) => ({ action: o.id, label: o.label, default: i === 0 }))
  });
}

export async function formulario(titulo, conteudo, rotuloOk = "Aplicar") {
  return DV2().prompt({
    window: { title: titulo }, rejectClose: false, content: conteudo,
    ok: { label: rotuloOk, callback: (ev, botao) => new foundry.applications.ux.FormDataExtended(botao.form).object }
  });
}

export const confirmar = (titulo, conteudo) => DV2().confirm({ window: { title: titulo }, content: conteudo });

/* --------------------- ações que só o Mestre executa --------------------- */

export {registrarPedido as registrarAcaoGM, solicitarPedido as pedirGM, rejeitarSocket as tratarSocket} from './pedidos.mjs';

/* --------------------- botões dos cartões de chat ------------------------ */

const BOTOES = {};
export const registrarBotao = (acao, fn) => { BOTOES[acao] = fn; };

export function instalarBotoesChat() {
  Hooks.on("renderChatMessageHTML", (mensagem, html) => {
    html.querySelectorAll("button[data-fh]").forEach((botao) => {
      botao.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const fn = BOTOES[botao.dataset.fh];
        if (!fn) return;
        botao.disabled = true;
        try { await fn({ mensagem, botao, dados: { ...botao.dataset } }); }
        catch (err) { console.error(`${FH} | botão ${botao.dataset.fh}`, err); botao.disabled = false; }
      });
    });
  });
}

/* ------------------------------- tabelas --------------------------------- */

let tabelasCache = null;
export async function tabelas() {
  if (!tabelasCache) tabelasCache = await (await fetch(foundry.utils.getRoute(`modules/${FH}/data/tabelas.json`))).json();
  return tabelasCache;
}

export function sortearFaixa(lista, valor) {
  return lista.find((l) => valor >= l.min && valor <= l.max);
}
