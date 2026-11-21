/**
 * Parte Exploração: tabelas de descobertas e achados, recompensas de criaturas e consumíveis.
 */
import { FH, parte, falar, escolher, pedirGM, tabelas, sortearFaixa, caminhoFlag } from "./util.mjs";

/* ------------------------------- tabelas --------------------------------- */

/** Descobertas (1d100): 01–05 raríssimo, 06–15 valioso (1d10), 16–100 comum (1d12). */
export async function rolarDescobertas(ator=null) {
  const t = await tabelas();
  const base = await new Roll("1d100").evaluate();
  const cat = sortearFaixa(t.descobertas, base.total);
  let detalhe = "";
  let resultado = cat?.texto ?? "";

  if (base.total <= 5) {
    detalhe = "Um achado raríssimo: uma dose do Elixir da Saúde ou um Pergaminho da Vitalidade, à escolha do Mestre.";
  } else if (base.total <= 15) {
    const r = await new Roll("1d10").evaluate();
    detalhe = `Achados Valiosos (1d10 = ${r.total}): ${sortearFaixa(t.achadosValiosos, r.total)?.texto}`;
    if (r.total === 10) await pedirGM("moedaAchado", ator?{actorUuid:ator.uuid}:{});
  } else {
    const r = await new Roll("1d12").evaluate();
    detalhe = `Achados Comuns (1d12 = ${r.total}): ${sortearFaixa(t.achadosComuns, r.total)?.texto}`;
  }
  await falar(null, "Descobertas", `<p>1d100 = <strong>${base.total}</strong>: ${resultado}</p><p>${detalhe}</p><p class="se-nota">Cada ponto investigável oferece uma única rolagem, compartilhada pelo grupo.</p>`);
}

/** Recompensa de criatura específica: 1d100, 01–05 recurso restaurador. */
export async function rolarRecompensa() {
  const t = await tabelas();
  const roll = await new Roll("1d100").evaluate();
  const r = sortearFaixa(t.recompensaCriatura, roll.total);
  await falar(null, "Recompensa de criatura específica", `<p>1d100 = <strong>${roll.total}</strong>: ${r?.texto}</p><p class="se-nota">Uma única vez por criatura. A Moeda do Destino é resolvida separadamente (25%).</p>`);
}

/* ------------------------------ consumíveis ------------------------------ */

export async function contextoConsumiveis(ator) {
  const lista = ator.items
    .filter((i) => i.type === "equipamento" && i.getFlag(FH, "consumivel"))
    .map((i) => ({
      id: i.id, nome: i.name, img: i.img, quantidade: i.system.quantidade, usos: i.system.usos,
      resumo: i.system.descricao?.slice(0, 90) ?? ""
    }));
  return { consumiveis: lista, tem: lista.length > 0 };
}

async function escolherExaustao(ator) {
  const normal = ator.system.exaustao.value;
  const mortes = ator.getFlag(FH, "mortes") ?? 0;
  if (normal && mortes) {
    return escolher("Remover Exaustão", [
      { id: "mortes", label: `Exaustão pela Morte (${mortes})` }, { id: "normal", label: `Exaustão comum (${normal})` }
    ], "<p>De qual Exaustão remover 1 nível?</p>");
  }
  return mortes ? "mortes" : normal ? "normal" : null;
}

export async function usarConsumivel(ator, item) {
  if ((item.system.quantidade ?? 0) <= 0) return ui.notifications.warn(`${item.name}: nenhuma unidade restante.`);
  const efeitos = item.getFlag(FH, "efeitos") ?? [];
  const linhas = [];
  await ator.gastarAcoes(1);

  for (const e of efeitos) {
    if (e.tipo === "pv") {
      const roll = await new Roll(e.formula).evaluate();
      const antes = ator.system.pv.value;
      const novo = Math.min(ator.system.pv.max, antes + roll.total);
      await ator.update({ "system.pv.value": novo });
      linhas.push(`Recupera ${novo - antes} PV (${e.formula} = ${roll.total}). PV ${novo}/${ator.system.pv.max}. Não remove ferimentos, doenças ou mutilações.`);
    } else if (e.tipo === "exaustao") {
      const qual = await escolherExaustao(ator);
      if (!qual) linhas.push("Não há Exaustão para remover.");
      else if (qual === "mortes") {
        await ator.setFlag(FH, "mortes", Math.max(0, (ator.getFlag(FH, "mortes") ?? 0) - e.n));
        linhas.push(`Remove ${e.n} nível de Exaustão pela Morte.`);
      } else {
        await ator.update({ "system.exaustao.value": Math.max(0, ator.system.exaustao.value - e.n) });
        linhas.push(`Remove ${e.n} nível de Exaustão.`);
      }
    } else if (e.tipo === "condicao") {
      if (ator.system.condicoes?.[e.remover]) {
        await ator.update({ [`system.condicoes.${e.remover}`]: false });
        linhas.push(`Encerra a condição ${CONFIG.SE.CONDICOES[e.remover] ?? e.remover}.`);
      } else linhas.push("Nenhuma condição correspondente para encerrar.");
    } else if (e.tipo === "infeccao") {
      const inf = ator.getFlag(FH, "infeccao");
      if (inf?.estagio === "leve") {
        await ator.setFlag(FH, "infeccao", { estagio: "", contagem: 0 });
        linhas.push("Encerra a Infecção Leve.");
      } else linhas.push("Só encerra uma infecção em estágio Leve; estágios maiores exigem tratamento completo.");
    }
  }

  // Consome: conjuntos com usos gastam um uso; os demais, uma unidade.
  if (item.system.usos > 0) {
    const usos = item.system.usos - 1;
    await item.update(usos <= 0 ? { "system.usos": 0, "system.quantidade": Math.max(0, item.system.quantidade - 1) } : { "system.usos": usos });
    linhas.push(`Usos restantes: ${Math.max(0, usos)}.`);
  } else {
    await item.update({ "system.quantidade": item.system.quantidade - 1 });
  }
  await falar(ator, item.name, `<p>${ator.name} usa <strong>${item.name}</strong>.</p>${linhas.map((l) => `<p>${l}</p>`).join("")}${item.system.descricao ? `<p class="se-nota">${item.system.descricao}</p>` : ""}`);
}

export function registrarExploracao(apiSE) {
  apiSE.registrarAcoes("fh-consumiveis", {
    usar: ({ ator, alvo }) => {
      const item = ator.items.get(alvo.closest("[data-item-id]").dataset.itemId);
      return item && usarConsumivel(ator, item);
    }
  });
}
