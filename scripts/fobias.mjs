/**
 * Parte Fobias: aquisição, ativação e controle de fobias; penalidades das condições da expansão;
 * infecção de ferimento progressiva. Painel na aba Condições.
 */
import { FH, api, parte, adulto, falar, botaoChat, confirmar, escolher, formulario, registrarBotao, tabelas, caminhoFlag } from "./util.mjs";

const FISICOS = ["for", "agi", "con"];

/* ------------------------------- painel ---------------------------------- */

const ESTAGIOS = { leve: "Leve", grave: "Grave", critica: "Crítica" };
const TRATAMENTOS = {
  leve: "Uma dose de erva verde preparada; ou 10 minutos, um uso de conjunto de tratamento e Medicina CD 13.",
  grave: "30 minutos, uma dose de erva verde preparada, um uso de conjunto de tratamento e Medicina CD 16.",
  critica: "30 minutos, uma dose de erva verde preparada, dois usos de conjunto de tratamento e Medicina CD 18."
};

export async function contextoFobias(ator) {
  const inf = ator.getFlag(FH, "infeccao") ?? { estagio: "", contagem: 0 };
  const duracao = { leve: "3 pontos de dano", grave: "2 horas", critica: "1 hora" };
  return {
    fobias: (ator.getFlag(FH, "fobias") ?? []).map((f, i) => ({ ...f, i })),
    inf: {
      ativa: !!inf.estagio, estagio: ESTAGIOS[inf.estagio] ?? "", contagem: inf.contagem,
      meta: duracao[inf.estagio] ?? "", tratamento: TRATAMENTOS[inf.estagio] ?? ""
    }
  };
}

/* --------------------------- aquisição de fobias ------------------------- */

async function sortearFobia(ator) {
  const t = await tabelas();
  const possuidas = (ator.getFlag(FH, "fobias") ?? []).map((f) => f.nome);
  const opcoes = t.fobias.filter((f) => (!f.adulto || adulto()) && !possuidas.includes(f.nome));
  if (!opcoes.length) return null;
  const roll = await new Roll(`1d${opcoes.length}`).evaluate();
  const f = opcoes[roll.total - 1];
  await roll.toMessage({ flavor: `<div class="se-flavor"><h3>Fobia aleatória</h3><p>Resultado: <strong>${f.nome}</strong>.</p></div>` });
  return f;
}

async function adicionarFobia(ator, { nome, gatilho }) {
  const lista = ator.getFlag(FH, "fobias") ?? [];
  if (lista.some((f) => f.nome === nome)) return ui.notifications.info("O personagem já possui essa fobia.");
  await ator.setFlag(FH, "fobias", [...lista, { nome, gatilho, ativa: false }]);
  await falar(ator, "Nova fobia", `<p>${ator.name} adquire <strong>${nome}</strong>.</p><p class="se-nota">Gatilhos: ${gatilho}</p>`);
}

/** Após um retorno (ou Autossacrifício): 1d100, 01–10 adquire uma fobia aleatória. */
export async function rolarFobiaRetorno(ator) {
  const roll = await new Roll("1d100").evaluate();
  const ganha = roll.total <= 10;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: ator }),
    flavor: `<div class="se-flavor"><h3>Fobia após o retorno</h3><p class="se-resultado ${ganha ? "falha" : "ok"}">${ganha ? "01–10: adquire uma fobia aleatória." : "11–100: nenhuma fobia nova."}</p></div>`
  });
  if (ganha) {
    const f = await sortearFobia(ator);
    if (f) await adicionarFobia(ator, { nome: f.nome, gatilho: f.gatilho });
  }
}

/* ------------------------------- infecção -------------------------------- */

async function danoDireto(ator, n) {
  const novo = Math.max(0, ator.system.pv.value - n);
  await ator.update({ "system.pv.value": novo });
  return novo;
}

async function avancarHora(ator) {
  const inf = foundry.utils.deepClone(ator.getFlag(FH, "infeccao") ?? { estagio: "", contagem: 0 });
  if (!inf.estagio) return ui.notifications.info("O personagem não está infectado.");
  const linhas = [];

  if (inf.estagio === "leve") {
    const pv = await danoDireto(ator, 1);
    inf.contagem += 1;
    linhas.push(`Sofre 1 de dano (ignora PR). PV ${pv}. Dano contado: ${inf.contagem}/3.`);
    if (inf.contagem >= 3) { inf.estagio = "grave"; inf.contagem = 0; linhas.push("A infecção passa para <strong>Grave</strong> (−2 em testes físicos)."); }
  } else if (inf.estagio === "grave") {
    const pv = await danoDireto(ator, 1);
    inf.contagem += 1;
    linhas.push(`Sofre 1 de dano (ignora PR). PV ${pv}. Horas neste estágio: ${inf.contagem}/2.`);
    if (inf.contagem >= 2) { inf.estagio = "critica"; inf.contagem = 0; linhas.push("A infecção passa para <strong>Crítica</strong> (deslocamento pela metade)."); }
  } else {
    inf.contagem += 1;
    linhas.push(`Horas neste estágio: ${inf.contagem}/1.`);
    if (inf.contagem >= 1) {
      await ator.setFlag(FH, "infeccao", inf);
      await falar(ator, "Infecção de Ferimento", `<p class="se-resultado falha">${ator.name} sucumbe à infecção crítica, independentemente dos PV restantes.</p>`);
      Hooks.callAll("sangueEscuro.morreu", ator, { causa: "infeccao-ferimento" });
      return;
    }
  }
  await ator.setFlag(FH, "infeccao", inf);
  await falar(ator, "Infecção de Ferimento: 1 hora", linhas.map((l) => `<p>${l}</p>`).join(""));
}

/* -------------------------------- registro ------------------------------- */

export function registrarFobias(apiSE) {
  apiSE.registrarAcoes("fh-fobias", {
    async sortear({ ator }) {
      const f = await sortearFobia(ator);
      if (f) await adicionarFobia(ator, { nome: f.nome, gatilho: f.gatilho });
      else ui.notifications.info("Não há fobias aleatórias disponíveis para sortear.");
    },
    retorno: ({ ator }) => rolarFobiaRetorno(ator),

    async adicionar({ ator }) {
      const f = await formulario("Adicionar fobia",
        `<div class="form-group"><label>Nome</label><input type="text" name="nome" autofocus></div>
         <div class="form-group"><label>Gatilhos</label><input type="text" name="gatilho"></div>`);
      if (f?.nome) await adicionarFobia(ator, { nome: f.nome.trim(), gatilho: (f.gatilho ?? "").trim() });
    },

    async remover({ ator, alvo }) {
      const lista = (ator.getFlag(FH, "fobias") ?? []).filter((_, i) => i !== Number(alvo.dataset.i));
      await ator.setFlag(FH, "fobias", lista);
    },

    /** Vontade CD 12 ao perceber o gatilho: falha deixa a fobia ativa durante a exposição. */
    async testar({ ator, alvo }) {
      const i = Number(alvo.dataset.i);
      const lista = foundry.utils.deepClone(ator.getFlag(FH, "fobias") ?? []);
      const roll = await ator.rolarVontade(12, `Fobia: ${lista[i].nome} (CD 12)`);
      if (roll.total < 12) {
        lista[i].ativa = true;
        await ator.setFlag(FH, "fobias", lista);
        await falar(ator, "Fobia ativa", `<p><strong>${lista[i].nome}</strong> está ativa enquanto a exposição continuar: ataques da criatura que a ativa recebem <strong>+2</strong> para acertar ${ator.name}, e testes diretamente ligados ao gatilho sofrem <strong>−2</strong>. Múltiplas fobias não acumulam.</p>`);
      }
    },

    /** 1 ação para recuperar o controle (Vontade CD 12; +2 com auxílio de um aliado). */
    async recuperar({ ator, alvo }) {
      const i = Number(alvo.dataset.i);
      const lista = foundry.utils.deepClone(ator.getFlag(FH, "fobias") ?? []);
      const ajuda = await confirmar("Recuperar o controle", "<p>Um aliado próximo gastou 1 ação para auxiliar (+2 neste teste)?</p>");
      await ator.gastarAcoes(1);
      const roll = await ator.rolarTeste({ chave: "san", rotulo: `Recuperar o controle: ${lista[i].nome} (CD 12)`, tipo: "vontade", cd: 12, mod: ator.system.atributos.san.mod + (ajuda ? 2 : 0) });
      if (roll.total >= 12) {
        lista[i].ativa = false;
        await ator.setFlag(FH, "fobias", lista);
        await falar(ator, "Controle recuperado", `<p>Os efeitos de ${lista[i].nome} terminam durante o restante da cena.</p>`);
      }
    },

    async desativar({ ator, alvo }) {
      const lista = foundry.utils.deepClone(ator.getFlag(FH, "fobias") ?? []);
      lista[Number(alvo.dataset.i)].ativa = false;
      await ator.setFlag(FH, "fobias", lista);
    },

    /* infecção */
    async contrair({ ator }) {
      if (ator.getFlag(FH, "infeccao")?.estagio) return ui.notifications.info("O personagem já está infectado.");
      const roll = await ator.rolarTeste({ chave: "con", rotulo: "Contrair infecção (CON CD 12)", cd: 12 });
      if (roll.total < 12) {
        await ator.setFlag(FH, "infeccao", { estagio: "leve", contagem: 0 });
        await falar(ator, "Infecção Leve", `<p>${ator.name} contrai <strong>Infecção Leve</strong>. Registre o horário e a parte do corpo. Depois de adquirida, exige tratamento: não há novos testes para impedir a progressão.</p>`);
      }
    },
    hora: ({ ator }) => avancarHora(ator),
    async tratar({ ator }) {
      const inf = ator.getFlag(FH, "infeccao");
      if (!inf?.estagio) return;
      if (await confirmar("Tratamento", `<p>O tratamento da infecção ${ESTAGIOS[inf.estagio]} foi concluído com sucesso?<br>${TRATAMENTOS[inf.estagio]}</p>`)) {
        await ator.setFlag(FH, "infeccao", { estagio: "", contagem: 0 });
        await falar(ator, "Infecção encerrada", "<p>O tratamento encerra a infecção, mas não recupera PV nem restaura tecidos ou membros destruídos.</p>");
      }
    }
  });
}

/* -------------------------------- ganchos -------------------------------- */

export function ganchosFobias() {
  // Penalidades de condições e infecção; +2 contra fobia ativa.
  Hooks.on("sangueEscuro.penalidades", (ator, resultado, ctx) => {
    if (!parte("Fobias")) return;
    const c = ator.system?.condicoes;
    if (c && ator.type === "character") {
      const fisico = FISICOS.includes(ctx.chave);
      if (c.envenenado && (fisico || ctx.tipo === "ataque")) resultado.partes.push({ grupo: "condicao", rotulo: "Envenenado", valor: -2 });
      if (c.infeccaoMembro && fisico) resultado.partes.push({ grupo: "condicao", rotulo: "Infecção de Membro", valor: -1 });
      const est = ator.getFlag(FH, "infeccao")?.estagio;
      if ((est === "grave" || est === "critica") && fisico) resultado.partes.push({ grupo: "condicao", rotulo: `Infecção ${ESTAGIOS[est]}`, valor: -2 });
      if (c.abstinencia && adulto()) resultado.partes.push({ grupo: "condicao", rotulo: "Abstinência", valor: -2 });
    }
    // O atacante (criatura) que ativa uma fobia ativa do alvo ganha +2 para acertar.
    if (ctx.tipo === "ataque" && ctx.alvo?.type === "character") {
      const ativas = (ctx.alvo.getFlag(FH, "fobias") ?? []).filter((f) => f.ativa).map((f) => f.nome);
      const gatilhos = ator.getFlag?.(FH, "fobiasAtivadas") ?? [];
      if (ativas.some((n) => gatilhos.includes(n))) resultado.partes.push({ rotulo: "Fobia ativa do alvo", valor: 2 });
    }
  });

  // Infecção crítica: deslocamento pela metade.
  Hooks.on("sangueEscuro.derivar", (ator) => {
    if (!parte("Fobias") || ator.type !== "character") return;
    if (ator.getFlag(FH, "infeccao")?.estagio === "critica") ator.system.deslocamento = ator.system.deslocamento / 2;
  });
}
