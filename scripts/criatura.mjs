/** Painel de anatomia e Rito da Morte na ficha de criatura. */
import { FH, parte, falar, confirmar } from "./util.mjs";
import { anatomiaDe } from "./combate.mjs";
import { ritoDaMorte } from "./morte.mjs";

export async function contextoCriatura(ator) {
  const anat = anatomiaDe(ator).map((p, i) => ({ ...p, i }));
  const rito = ator.getFlag(FH, "rito") ?? { disponivel: false };
  return {
    anatomia: anat, temAnatomia: anat.length > 0,
    rito, preparado: !!ator.getFlag(FH, "ritoPreparado"),
    fobias: (ator.getFlag(FH, "fobiasAtivadas") ?? []).join(", ")
  };
}

export function registrarCriatura(apiSE) {
  apiSE.registrarAcoes("fh-criatura", {
    async alternarParte({ ator, alvo }) {
      const anat = anatomiaDe(ator);
      const p = anat[Number(alvo.dataset.i)];
      p.destruida = !p.destruida;
      await ator.setFlag(FH, "anatomia", anat);
      if (p.destruida) await falar(ator, "Parte destruída", `<p><strong>${p.nome}</strong> de ${ator.name}: ${p.consequencia}</p>`);
    },
    async restaurarTudo({ ator }) {
      if (!await confirmar("Restaurar anatomia", "<p>Marcar todas as partes como intactas?</p>")) return;
      const anat = anatomiaDe(ator).map((p) => ({ ...p, destruida: false }));
      await ator.setFlag(FH, "anatomia", anat);
    },
    async prepararRito({ ator }) {
      await ator.setFlag(FH, "ritoPreparado", true);
      const r = ator.getFlag(FH, "rito");
      falar(ator, "Sinal do Rito da Morte", `<p>${r?.sinal || `${ator.name} sobreviveu a um ataque letal e se prepara para o Rito da Morte.`}</p><p class="se-nota">Interrupção: ${r?.interrupcao || "conforme a ficha"}. No início do próximo turno, se ainda puder agir, a criatura lança a moeda.</p>`);
    },
    async realizarRito({ ator }) {
      await ator.setFlag(FH, "ritoPreparado", false);
      await ritoDaMorte(ator.name);
    }
  });
}
