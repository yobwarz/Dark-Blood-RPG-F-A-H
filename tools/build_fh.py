#!/usr/bin/env python3
"""
Gera data/*.json do módulo Fear & Hunger a partir do documento de referência (Markdown).
Uso: python3 tools/build_fh.py caminho/do/documento.md      (requer pandoc)
"""
import json, re, subprocess, sys, pathlib

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)
L = SRC.read_text(encoding="utf-8").split("\n")
FH = "sangue-escuro-fear-and-hunger"


def trecho(a, b):
    """Linhas a..b (1-indexadas, inclusivas)."""
    return "\n".join(L[a - 1:b])


def html(md):
    md = re.sub(r"^#{2,3}\s*$", "", md, flags=re.M)        # títulos vazios do documento
    r = subprocess.run(["pandoc", "-f", "markdown-smart-auto_identifiers", "-t", "html", "--wrap=none"],
                       input=md, capture_output=True, text=True, check=True)
    return r.stdout


def limpar(t):
    t = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|=<>~])", r"\1", t)
    t = t.replace("**", "").replace("*", "")
    return re.sub(r"\s+", " ", t).strip()


def tabela(a, b):
    linhas = []
    for l in L[a - 1:b]:
        if l.startswith("|"):
            cel = [limpar(c) for c in l.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", c) for c in cel):
                linhas.append(cel)
    return linhas[1:]


# ------------------------------------------------------------------ regras (diários)
def pagina(nome, *intervalos, subst=None):
    md = "\n".join(trecho(a, b) for a, b in intervalos)
    for velho, novo in (subst or []):
        md = md.replace(velho, novo)
    return {"nome": nome, "html": html(md)}


# linhas sensíveis, movidas para o conteúdo de teor adulto
linha_guarda = next(l for l in L if l.startswith("| **Guarda da Masmorra** |"))
linha_erotofobia = next(l for l in L if l.startswith("| 4 | Erotofobia"))

regras = [
    pagina("Aviso de Conteúdo", (17, 48)),
    pagina("Ambientação: O Ventre do Abismo", (49, 140)),
    pagina("Combate, Mutilação e Destino", (141, 383)),
    pagina("Descanso, Retorno e Recursos", (384, 475)),
    pagina("Exploração, Descobertas e Recompensas", (476, 558)),
    pagina("Trajes e Proteção", (559, 582)),
    pagina("Classes e Origens", (583, 705)),
    pagina("Equipamentos, Alimentos e Tratamento", (706, 790)),
    pagina("Armas", (791, 817)),
    pagina("Magia: Pergaminhos e Magias", (818, 861)),
    pagina("Altares e Pactos", (862, 899)),
    pagina("Rituais dos Altares", (904, 934), (995, 1163),
           subst=[("Estes rituais complementam os pactos e a **União da Carne**, que mantém suas regras próprias.",
                   "Estes rituais complementam os pactos.")]),
    pagina("Fobias", (1164, 1253), subst=[(linha_erotofobia + "\n", "")]),
    pagina("Condições da Expansão", (1254, 1283)),
    pagina("Infecção de Ferimento", (1284, 1333)),
    pagina("Descanso e Persistência", (1356, 1363)),
    pagina("Narradores: Modelo de Ficha de Criatura", (1364, 1415)),
    pagina("Consequências da Derrota Total", (1416, 1451), subst=[(linha_guarda + "\n", "")]),
    pagina("Criaturas das Profundezas: Regras de Utilização", (1452, 1473)),
    pagina("Segredos e Glitches", (1978, 2078)),
    pagina("Quadro Técnico de Mudanças", (2079, 2099)),
    pagina("Sobre a Expansão e Política de Uso", (2100, 2145)),
]
# a página de Descanso e Persistência pode ficar vazia
regras = [r for r in regras if len(re.sub(r"<[^>]+>|\s", "", r["html"])) > 20]
(OUT / "regras.json").write_text(json.dumps(regras, ensure_ascii=False, indent=1), encoding="utf-8")

adulto_md_derrota = ("### Consequência adicional da Guarda da Masmorra\n\nTabela de consequências da derrota total (linha omitida do texto principal):\n\n"
                     "| Criatura | Ato após a derrota total | Consequência no retorno |\n| :---: | :---: | :---: |\n" + linha_guarda)
adulto_md_fobia = ("### Fobia adicional\n\nQuando o conteúdo de teor adulto está ativo, a tabela de fobias aleatórias inclui:\n\n"
                   "| d10 | Fobia | Gatilhos |\n| --- | --- | --- |\n" + linha_erotofobia)
regras_adulto = [
    pagina("Ritos de Carne e União da Carne", (900, 903), (935, 994)),
    pagina("Lesões Íntimas, Dependência e Abstinência", (1334, 1355)),
    {"nome": "Derrota Total e Fobia: Complementos", "html": html(adulto_md_derrota + "\n\n" + adulto_md_fobia)},
]
(OUT / "regras-adulto.json").write_text(json.dumps(regras_adulto, ensure_ascii=False, indent=1), encoding="utf-8")

# ------------------------------------------------------------------ tabelas
def faixa(txt):
    m = re.match(r"(\d+)\s*[–-]\s*(\d+)", txt)
    if m: return int(m.group(1)), int(m.group(2))
    m = re.match(r"(\d+)", txt)
    return (int(m.group(1)),) * 2 if m else (0, 0)

def tabela_faixas(a, b):
    out = []
    for cel in tabela(a, b):
        lo, hi = faixa(cel[0])
        out.append({"min": lo, "max": hi, "texto": cel[1]})
    return out

tabelas = {
    "descobertas": tabela_faixas(496, 500),
    "achadosComuns": tabela_faixas(506, 519),
    "achadosValiosos": tabela_faixas(527, 534),
    "recompensaCriatura": tabela_faixas(550, 553),
    "fobias": [{"n": int(c[0]), "nome": c[1], "gatilho": c[2], "adulto": c[1] == "Erotofobia"} for c in tabela(1191, 1202)],
}
(OUT / "tabelas.json").write_text(json.dumps(tabelas, ensure_ascii=False, indent=1), encoding="utf-8")

# ------------------------------------------------------------------ itens
itens = []
def item(nome, tipo, pasta, system, img, flags=None):
    d = {"name": nome, "type": tipo, "img": img, "pasta": pasta, "system": system}
    if flags: d["flags"] = {FH: flags}
    itens.append(d)

IMG = {"arma": "icons/svg/sword.svg", "protecao": "icons/svg/shield.svg", "habilidade": "icons/svg/upgrade.svg",
       "equipamento": "icons/svg/item-bag.svg", "magia": "icons/svg/explosion.svg", "pergaminho": "icons/svg/book.svg"}

# armas
for nome, dano, acoes, uso, letal in tabela(797, 808):
    m = re.match(r"(\d+d\d+)\s+(\w+)", dano)
    formula, tipo = m.group(1), m.group(2).capitalize()
    tipo = {"Contusivo": "Contundente"}.get(tipo, tipo)
    distancia = "disparo" in uso.lower() or "alcance de 18" in uso
    esmag = "esmag" in letal.lower()
    item(nome, "arma", "Armas", {
        "categoria": "improvisada" if distancia else "branca", "subgrupo": "À distância" if distancia else "Corpo a corpo",
        "dano": formula, "tipoDano": tipo, "atributo": "agi" if distancia or nome.startswith("Faca") else "for",
        "somaAtributoDano": not distancia, "margemCritico": 20, "capacidade": 1 if distancia else 0,
        "municao": "Projétil" if distancia else "", "acoesPorAtaque": int(acoes), "longa": "duas mãos" in uso.lower(),
        "durabilidade": {"value": 10, "max": 10}, "descricao": f"{uso}. Ataque letal: {letal}."
    }, IMG["arma"], {"letal": "nao" if letal.lower().startswith("não") else ("esmagamento" if esmag else "sim"), "uso": uso})

# trajes
for nome, pr in tabela(563, 569):
    item(nome, "protecao", "Trajes", {"pr": int(pr), "compartimentos": 1, "durabilidade": {"value": 10, "max": 10},
        "descricao": "Cada peça indica as partes do corpo que protege. Proteções sobrepostas não somam PR."}, IMG["protecao"])

# ferramentas e iluminação
for nome, desc in tabela(720, 730):
    usos = 3 if nome == "Giz ritual" else 0
    item(nome, "equipamento", "Iluminação e Ferramentas", {"categoria": "ferramenta", "quantidade": 1, "compartimentosFixos": 1,
        "usos": usos, "descricao": desc}, IMG["equipamento"])

# consumíveis (efeitos automatizáveis no módulo)
EFEITOS = {
    "Bandagem limpa": [{"tipo": "condicao", "remover": "sangramento"}],
    "Erva azul preparada": [{"tipo": "pv", "formula": "1d4"}],
    "Mistura restauradora": [{"tipo": "pv", "formula": "1d4+2"}],
    "Erva verde preparada": [{"tipo": "infeccao"}],
    "Antídoto específico": [{"tipo": "condicao", "remover": "envenenado"}],
    "Elixir da Saúde": [{"tipo": "exaustao", "n": 1}, {"tipo": "condicao", "remover": "envenenado"}],
}
for nome, efeito in tabela(775, 785):
    flags = {"consumivel": True, "efeitos": EFEITOS.get(nome, [{"tipo": "texto"}])}
    usos = 3 if nome == "Conjunto de tratamento" else 0
    item(nome, "equipamento", "Tratamento e Consumíveis", {"categoria": "medico", "quantidade": 1, "compartimentosFixos": 1,
        "usos": usos, "descricao": efeito}, IMG["equipamento"], flags)
item("Pergaminho da Vitalidade", "equipamento", "Pergaminhos", {"categoria": "documento", "quantidade": 1, "compartimentosFixos": 1,
    "descricao": "Utilizar custa 1 ação, consome o pergaminho e remove 1 nível de Exaustão, incluindo Exaustão pela Morte."},
    IMG["pergaminho"], {"tipo": "pergaminho", "magia": "Feitiço da Vitalidade", "consumivel": True,
                        "efeitos": [{"tipo": "exaustao", "n": 1}]})
item("Pedra de Alma ocupada", "equipamento", "Rituais", {"categoria": "diverso", "quantidade": 1, "compartimentosFixos": 1,
    "descricao": "Recompensa rara. Paga uma única Consagração Sombria de Arma e é consumida no ritual."}, IMG["equipamento"])

# classes
usos_classe = {"Mercenário", "Cavaleiro", "Forasteiro", "Ladrão", "Médico", "Caçador", "Condenado"}
i = 589
while i < 650:
    m = re.match(r"^### \*\*(.+?)\*\*", L[i - 1])
    if m:
        nome = m.group(1)
        fim_classe = next(k for k in range(i, 700) if L[k].startswith("##"))
        sub = [x for x in L[i:fim_classe] if x.strip()]
        hab = next((x for x in sub if re.match(r"^\*\*[^*]+\.\*\*", x)), "")
        titulo = re.match(r"^\*\*([^*]+?)\.\*\*", hab).group(1) if hab else nome
        desc = limpar(" ".join(sub))
        extra = limpar(" ".join(x for x in sub if x != hab and x is not sub[0]))
        item(f"{nome}: {titulo}", "habilidade", "Classes", {
            "grupo": "Classe", "custo": 0, "prerequisito": f"Classe {nome}",
            "usos": {"value": 1 if nome in usos_classe else 0, "max": 1 if nome in usos_classe else 0, "recarga": "longo" if nome in usos_classe else ""},
            "descricao": desc}, IMG["habilidade"], {"tipo": "classe", "classe": nome})
    i += 1

# origens
for nome, prof, fardo in tabela(665, 678):
    item(f"Origem: {nome}", "habilidade", "Origens", {"grupo": "Origem", "custo": 0, "prerequisito": "Origem",
        "descricao": f"Proficiência: {prof} (não consome PE; se já possuir, escolha Percepção, Investigação, Furtividade ou Medicina).\n\nFardo: {fardo}\n\nRegistre um detalhe concreto: o nome do credor, o segredo, a pessoa procurada ou a obrigação."},
        IMG["habilidade"], {"tipo": "origem", "origem": nome, "proficiencia": prof})

# magias e pergaminhos
MAGIAS = {
    "Truque Piromântico": {"ataque": True, "dano": "1d6", "tipoDano": "Fogo", "alcance": "9 m"},
    "Ferir": {"ataque": True, "dano": "1d6", "tipoDano": "Outro", "alcance": "9 m"},
    "Sussurros Amorosos": {"cura": "1d4+1", "alcance": "Toque"},
    "Luz Pálida": {"alcance": "Toque"},
    "Selo de Contenção": {"teste": "Força", "alcance": "6 m"},
    "Revelar Vestígios": {"alcance": "Pessoal"},
    "Purificação da Carne": {"alcance": "Toque"},
    "Feitiço da Vitalidade": {"alcance": "Toque", "soPergaminho": True},
}
for nome, efeito in tabela(851, 860):
    f = {"tipo": "magia", **MAGIAS[nome]}
    if not f.get("soPergaminho"):
        item(nome, "habilidade", "Magias", {"grupo": "Magia", "custo": 0, "prerequisito": "Magia aprendida (pacto, instrução ou recompensa)",
            "usos": {"value": 1, "max": 1, "recarga": "longo"},
            "descricao": f"{efeito}\n\nMagia aprendida: uma vez entre Descansos Longos; custa 1 PV (sem redução por PR) e exige pelo menos 2 PV. Ataque mágico: d20 + SAB. CD: 10 + SAB."},
            IMG["magia"], f)
    item(f"Pergaminho: {nome}", "equipamento", "Pergaminhos", {"categoria": "documento", "quantidade": 1, "compartimentosFixos": 1,
        "descricao": f"{efeito}\n\nConjurar custa 1 ação; é consumido. Não custa PV e não ensina a magia."},
        IMG["pergaminho"], {"tipo": "pergaminho", "magia": nome, **{k: v for k, v in f.items() if k != "tipo"}})

# Preserva a identidade visual ao regenerar o catálogo.
visual_path = OUT / "icones-itens.json"
if visual_path.exists():
    visual = {v["name"]:v["img"] for v in json.loads(visual_path.read_text(encoding="utf-8"))}
    for obj in itens:
        obj["img"] = visual.get(obj["name"], obj["img"])

(OUT / "itens.json").write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")

# ------------------------------------------------------------------ criaturas
inicios = [i + 1 for i, l in enumerate(L) if re.match(r"^## \*\*", l) and 1474 <= i + 1 < 1978]
fins = inicios[1:] + [1978]
atores = []
def mod_para_valor(m):
    return 10 + 2 * m                       # +0→10, +3→16, −1→8
for a, b in zip(inicios, fins):
    nome = re.sub(r"^## \*\*|\*\*\s*$", "", L[a - 1]).strip()
    nome_curto = limpar(nome.split("—")[0]).strip()
    bloco = L[a - 1:b - 1]
    texto = "\n".join(bloco)
    st = {}
    for linha in bloco:
        m = re.match(r"^\| \*\*(.+?)\*\* \| (.+) \|$", linha)
        if m: st[limpar(m.group(1))] = limpar(m.group(2))
    pv = int(re.search(r"\d+", st.get("PV gerais", "10")).group())
    na = int(re.search(r"\d+", st.get("NA", "10")).group())
    pr = int(re.search(r"\d+", st.get("PR", "0")).group())
    desloc = float(re.search(r"[\d,]+", st.get("Deslocamento", "9")).group().replace(",", "."))
    mods = {k: int(v.replace("−", "-").replace("+", "")) for k, v in re.findall(r"(Força|Agilidade|Constituição|Vontade) ([+\-−]\s?\d+)", st.get("Modificadores", "").replace(" ", " "))
            for v in [v.replace(" ", "")]}
    # anatomia
    anat = []
    for linha in bloco:
        m = re.match(r"^\| (?:\*\*)?(.+?)(?:\*\*)? \| (\d+) \| (.+) \|$", linha)
        if m and m.group(1) != "Parte":
            parte, lim, cons = limpar(m.group(1)), int(m.group(2)), limpar(m.group(3))
            if parte.lower().startswith("cada "):
                base = parte[5].upper() + parte[6:]
                masc = base.lower().startswith(("braço", "pé", "olho"))
                for lado in (("direito", "esquerdo") if masc else ("direita", "esquerda")):
                    anat.append({"nome": f"{base} {lado}", "limite": lim, "consequencia": cons, "destruida": False})
            else:
                anat.append({"nome": parte, "limite": lim, "consequencia": cons, "destruida": False})
    # primeiro ataque
    atq = re.search(r"\*\*([^*]+?)\s+—\s+\d+ ação[^*]*\.\*\*\s+Ataque\s+\*\*\\?([+\-−]?\d+)\*\*.*?dano\s+\*\*(\d+d\d+)\s+(\w+)\*\*", texto)
    ataque, dano, tipo = 2, "1d4", "Contundente"
    if atq:
        ataque = int(atq.group(2).replace("−", "-").replace("+", ""))
        dano = atq.group(3)
        tipo = {"contusivo": "Contundente", "cortante": "Cortante", "perfurante": "Perfurante"}.get(atq.group(4).lower(), "Outro")
    fobias = sorted(set(re.findall(r"\b([A-Z][a-zçã]+fobia)\b", st.get("Fobias ativadas", ""))) - {"Erotofobia"} if False else
                    [f for f in set(re.findall(r"\b([A-Z][a-zçã]+fobia)\b", st.get("Fobias ativadas", ""))) if f != "Erotofobia"])
    idx = next((k for k, l in enumerate(bloco) if re.match(r"^### \*\*Rito da Morte", l)), None)
    rito_disp = False
    if idx is not None:
        titulo_rito = bloco[idx]
        seguinte = next((l for l in bloco[idx + 1:] if l.strip()), "")
        rito_disp = ":" in titulo_rito and not seguinte.lower().startswith("não possui")
    sinal = re.search(r"Prepara[çc][ãa]o:\*\*\s*(.+)", texto)
    interr = re.search(r"Interrup[çc][ãa]o:\*\*\s*(.+)", texto)
    # notas: texto da ficha, sem a tabela de características (já nos campos)
    corpo_notas = "\n".join(bloco[1:])
    corpo_notas = re.sub(r";\s*Erotofobia quando[^|\n]*?(?=\s*\|)", "", corpo_notas)     # fobia adicional: só no conteúdo de teor adulto
    notas = html(corpo_notas)
    atores.append({
        "name": nome_curto, "type": "criatura", "img": "icons/svg/skull.svg", "pasta": "Criaturas das Profundezas",
        "system": {"atributos": {"for": {"valor": mod_para_valor(mods.get("Força", 0))}, "agi": {"valor": mod_para_valor(mods.get("Agilidade", 0))},
                                 "con": {"valor": mod_para_valor(mods.get("Constituição", 0))}, "san": {"valor": mod_para_valor(mods.get("Vontade", 0))}},
                   "pv": {"value": pv, "max": pv}, "na": na, "pr": pr, "deslocamento": desloc, "iniciativa": mods.get("Agilidade", 0),
                   "ataque": ataque, "dano": dano, "tipoDano": tipo, "semCirculacao": "Esqueleto" in nome or "Prisoner" in nome,
                   "notas": notas},
        "flags": {FH: {"anatomia": anat, "fobiasAtivadas": fobias,
                       "rito": {"disponivel": rito_disp, "sinal": limpar(sinal.group(1)) if sinal else "", "interrupcao": limpar(interr.group(1)) if interr else ""}}}
    })
(OUT / "criaturas.json").write_text(json.dumps(atores, ensure_ascii=False, indent=1), encoding="utf-8")

print("regras", len(regras), "| adulto", len(regras_adulto), "| itens", len(itens), "| criaturas", len(atores))
