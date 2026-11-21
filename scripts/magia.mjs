/**
 * Parte Magia: conjuração (magias aprendidas e pergaminhos) e pactos/sacrifícios permanentes.
 * Magias são habilidades com flags { tipo: "magia" }; pergaminhos são equipamentos com flags { tipo: "pergaminho" }.
 */
import { FH, parte, adulto, falar, botaoChat, formulario, confirmar, registrarBotao, caminhoFlag } from "./util.mjs";

const tipoDe = (item) => item.getFlag(FH, "tipo");

/* ---------------------------------- página ------------------------------- */

export async function contextoMagia(ator) {
  const sab = ator.system.atributos.sab.mod;
  const magias = ator.items.filter((i) => i.type === "habilidade" && tipoDe(i) === "magia").map((i) => ({
    id: i.id, nome: i.name, img: i.img, alcance: i.getFlag(FH, "alcance") ?? "", usos: i.system.usos.value, usosMax: i.system.usos.max,
    ataque: !!i.getFlag(FH, "ataque"), resumo: (i.system.descricao ?? "").split("\n")[0].slice(0, 120)
  }));
  const pergaminhos = ator.items.filter((i) => i.type === "equipamento" && tipoDe(i) === "pergaminho").map((i) => ({
    id: i.id, nome: i.name, img: i.img, quantidade: i.system.quantidade, resumo: (i.system.descricao ?? "").split("\n")[0].slice(0, 120)
  }));
  const pactos = (ator.getFlag(FH, "pactos") ?? []).map((p, i) => ({ ...p, i }));
  return {
    magias, pergaminhos, pactos, temMagias: magias.length > 0, temPergaminhos: pergaminhos.length > 0,
    ataqueMagico: sab >= 0 ? `+${sab}` : `${sab}`, cd: 10 + sab,
    pvMaxPactos: pactos.reduce((t, p) => t + (Number(p.pvMax) || 0), 0),
    bloqueada: !!(adulto() && ator.system.condicoes?.uniaoCarne)
  };
}

/* ------------------------------- conjuração ------------------------------ */

async function executarEfeito(ator, nome, f, origem) {
  const sab = ator.system.atributos.sab.mod;
  const cd = 10 + sab;
  const alvo = game.user.targets.first()?.actor;
  const dados = { actor: ator.uuid, nome, tipo: f.tipoDano ?? "Outro" };

  if (f.ataque) {
    ator.setFlag(FH, "ataquesTurno", (ator.getFlag(FH, "ataquesTurno") ?? 0) + 1);
    const botao = f.dano ? botaoChat("danoMagia", `Rolar dano (${f.dano})`, { ...dados, formula: f.dano }) : "";
    await ator.rolarTeste({
      chave: "sab", rotulo: `Ataque mágico: ${nome}`, tipo: "ataque", cd: alvo ? Number(alvo.system.na ?? 10) : 10,
      extraFlavor: `<p class="se-nota">${origem} · alcance ${f.alcance ?? "—"} · contra ${alvo ? `${alvo.name} (NA ${alvo.system.na})` : "NA 10"}</p>${botao ? `<div class="se-botoes">${botao}</div>` : ""}`,
      contexto: { alvo }
    });
    return;
  }
  const extras = [];
  if (f.cura) extras.push(botaoChat("curaMagia", `Rolar cura (${f.cura})`, { ...dados, formula: f.cura }));
  const testeTxt = f.teste ? `<p>O alvo faz um teste de <strong>${f.teste}</strong> contra CD <strong>${cd}</strong> (10 + SAB).</p>` : "";
  await falar(ator, nome, `<p>${ator.name} conjura <strong>${nome}</strong> (${origem}). Alcance: ${f.alcance ?? "—"}. CD ${cd}.</p>${testeTxt}`, extras.join(" "));
}

async function conjurar(ator, item) {
  if (adulto() && ator.system.condicoes?.uniaoCarne) return ui.notifications.warn("A União da Carne impede a conjuração (ruptura com a magia).");
  if (ator.system.pv.value < 2) return ui.notifications.warn("É preciso ter pelo menos 2 PV para conjurar uma magia aprendida.");
  const usos = item.system.usos;
  if (usos.max > 0 && usos.value <= 0) return ui.notifications.warn(`${item.name} já foi conjurada: uma vez entre Descansos Longos.`);
  if (game.combat?.started && (ator.getFlag(FH, "ataquesTurno") ?? 0) >= 2 && item.getFlag(FH, "ataque")) {
    return ui.notifications.warn("Limite de ataques do turno atingido.");
  }
  await ator.gastarAcoes(1);
  await ator.update({ "system.pv.value": ator.system.pv.value - 1 });     // 1 PV, sem redução por PR
  if (usos.max > 0) await item.update({ "system.usos.value": usos.value - 1 });
  await executarEfeito(ator, item.name, item.flags[FH] ?? {}, "magia aprendida, custa 1 PV");
}

async function usarPergaminho(ator, item) {
  if (item.system.quantidade <= 0) return ui.notifications.warn("Nenhuma unidade deste pergaminho.");
  await ator.gastarAcoes(1);
  await item.update({ "system.quantidade": item.system.quantidade - 1 });
  if (item.getFlag(FH, "efeitos")) return; // Pergaminho da Vitalidade usa o fluxo de consumíveis
  await executarEfeito(ator, item.getFlag(FH, "magia") ?? item.name, item.flags[FH] ?? {}, "pergaminho consumido, sem custo de PV");
}

/* ------------------------------- registro -------------------------------- */

export function registrarMagia(apiSE) {
  apiSE.registrarAcoes("fh-magia", {
    conjurar: ({ ator, alvo }) => { const i = ator.items.get(alvo.closest("[data-item-id]").dataset.itemId); return i && conjurar(ator, i); },
    pergaminho: ({ ator, alvo }) => { const i = ator.items.get(alvo.closest("[data-item-id]").dataset.itemId); return i && usarPergaminho(ator, i); },

    async pactoAdd({ ator }) {
      const f = await formulario("Novo pacto ou sacrifício",
        `<div class="form-group"><label>Preço pago (permanente)</label><input type="text" name="preco" autofocus></div>
         <div class="form-group"><label>Benefício concedido</label><input type="text" name="beneficio"></div>
         <div class="form-group"><label>Redução permanente de PV máximos</label><input type="number" name="pvMax" value="0" min="0"></div>`);
      if (!f?.preco) return;
      const lista = ator.getFlag(FH, "pactos") ?? [];
      await ator.setFlag(FH, "pactos", [...lista, { preco: f.preco.trim(), beneficio: (f.beneficio ?? "").trim(), pvMax: Number(f.pvMax) || 0 }]);
      await falar(ator, "Pacto", `<p>${ator.name} sela um pacto: <strong>${f.preco}</strong> em troca de ${f.beneficio || "um benefício"}${Number(f.pvMax) ? ` (−${f.pvMax} PV máximos)` : ""}.</p><p class="se-nota">Esses efeitos são permanentes e só se desfazem por meio de ritual que declare essa capacidade.</p>`);
    },
    async pactoDel({ ator, alvo }) {
      if (!(await confirmar("Remover pacto", "<p>Remover este pacto da ficha? (Use apenas se um ritual o desfez.)</p>"))) return;
      const lista = (ator.getFlag(FH, "pactos") ?? []).filter((_, i) => i !== Number(alvo.dataset.i));
      await ator.setFlag(FH, "pactos", lista);
    }
  });

  registrarBotao("danoMagia", async ({ dados }) => {
    const ator = await fromUuid(dados.actor);
    if (!ator?.isOwner && !game.user.isGM) return;
    const roll = await new Roll(dados.formula).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: ator }),
      flavor: `<div class="se-flavor"><h3>Dano: ${dados.nome}</h3><p class="se-nota">${dados.tipo}. O PR do alvo reduz o dano.</p></div>`,
      flags: { "sangue-escuro": { dano: { origem: ator.uuid, nome: dados.nome, total: roll.total, tipoDano: dados.tipo, critico: false, efeito: "" } } }
    });
  });

  registrarBotao("curaMagia", async ({ dados }) => {
    const ator = await fromUuid(dados.actor);
    if (!ator?.isOwner && !game.user.isGM) return;
    const roll = await new Roll(dados.formula).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: ator }),
      flavor: `<div class="se-flavor"><h3>Cura: ${dados.nome}</h3><p class="se-nota">O alvo recupera ${roll.total} PV (não remove ferimentos nem doenças).</p></div>`
    });
  });
}

export function ganchosMagia() {
  // Pactos reduzem os PV máximos de forma permanente.
  Hooks.on("sangueEscuro.derivar", (ator) => {
    if (!parte("Magia") || ator.type !== "character") return;
    const total = (ator.getFlag(FH, "pactos") ?? []).reduce((t, p) => t + (Number(p.pvMax) || 0), 0);
    if (total > 0) {
      ator.system.pv.max = Math.max(1, ator.system.pv.max - total);
      ator.system.pv.value = Math.min(ator.system.pv.value, ator.system.pv.max);
    }
  });
}
