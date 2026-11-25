/* =========================================================
   Protótipo — Sistema de Gestão de Aluguer de Andaimes e Cofragem
   Dados de exemplo gravados no navegador (localStorage).
   Regras implementadas: RF01–RF29 do levantamento v1.0
   Faturação: Opção A (período estimado com acerto) — ponto 6.1
   ========================================================= */

const KEY = 'andaimes-prototipo-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mt = n => (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MT';
const nf = n => Number(n).toLocaleString('pt-PT');
const dt = iso => iso ? iso.split('-').reverse().join('/') : '';
const pad = (n, l = 4) => String(n).padStart(l, '0');
const utc = iso => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
/* RF20 — não se contam o dia de levantamento nem o de devolução */
const diasCobrados = (lev, dev) => Math.max(0, diasEntre(lev, dev) - 1);
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`; };

let S;   // estado da aplicação
let M;   // estado do formulário aberto no modal

/* ---------------- Persistência ---------------- */
function guardar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sem armazenamento: continua em memória */ } }
function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { S = JSON.parse(raw); if (!S.utilizadores) { S.utilizadores = utilizadoresExemplo(); S.sessao = null; } return; }
  } catch (e) {}
  S = dadosExemplo();
  guardar();
}

function utilizadoresExemplo() {
  return [
    { user: 'admin', pass: 'admin123', nome: 'Ana Macuácua', perfil: 'admin', activo: true },
    { user: 'apontador', pass: 'apont123', nome: 'Rui Sitoe', perfil: 'apontador', activo: true },
    { user: 'faturacao', pass: 'fatura123', nome: 'Célia Nhantumbo', perfil: 'faturacao', activo: true }
  ];
}
const NOME_PERFIL = { admin: 'Administrador', apontador: 'Apontador', faturacao: 'Faturação' };
function estadoVazio() {
  return {
    empresa: { nome: 'Ferragem, Lda', nuit: '400987654', morada: 'Av. de Moçambique, 1234, Maputo', contactos: '+258 84 000 0000 · geral@ferragem.co.mz' },
    diasPrevPadrao: 30,
    perfil: null,
    sessao: null,
    utilizadores: utilizadoresExemplo(),
    artigos: [
      { cod: 'PR-200', cat: 'Prumo', medida: '2,00 m', desc: 'Prumo metálico regulável 2,00 m', total: 400, preco: 15 },
      { cod: 'PR-250', cat: 'Prumo', medida: '2,50 m', desc: 'Prumo metálico regulável 2,50 m', total: 300, preco: 18 },
      { cod: 'TR-100', cat: 'Travessa', medida: '1,00 m', desc: 'Travessa de andaime 1,00 m', total: 500, preco: 8 },
      { cod: 'TR-250', cat: 'Travessa', medida: '2,50 m', desc: 'Travessa de andaime 2,50 m', total: 350, preco: 12 },
      { cod: 'CH-120', cat: 'Chapa de cofragem', medida: '1,20 m', desc: 'Chapa de cofragem 1,20 × 0,60 m', total: 250, preco: 25 },
      { cod: 'CH-150', cat: 'Chapa de cofragem', medida: '1,50 m', desc: 'Chapa de cofragem 1,50 × 0,60 m', total: 200, preco: 30 },
      { cod: 'BR-FIX', cat: 'Braçadeira', medida: 'Fixa', desc: 'Braçadeira fixa 48 mm', total: 1000, preco: 3 },
      { cod: 'BR-GIR', cat: 'Braçadeira', medida: 'Giratória', desc: 'Braçadeira giratória 48 mm', total: 600, preco: 4 }
    ],
    cotacoes: [], clientes: [], obras: [], guias: [], faturas: [], lotes: [],
    seq: { COT: 0, GE: 0, GD: 0, FT: 0, CL: 0, OB: 0 }
  };
}
const nextId = k => { S.seq[k]++; return `${k}-${pad(S.seq[k])}`; };

/* ---------------- Consultas ---------------- */
const artigo = cod => S.artigos.find(a => a.cod === cod);
const cliente = id => S.clientes.find(c => c.id === id);
const obra = id => S.obras.find(o => o.id === id);
const obrasDe = cid => S.obras.filter(o => o.clienteId === cid);
const alugado = cod => S.lotes.filter(l => l.cod === cod).reduce((s, l) => s + l.rest, 0);
const emArmazem = cod => artigo(cod).total - alugado(cod);
function saldoObra(oid) {
  const r = {};
  S.lotes.filter(l => l.obraId === oid && l.rest > 0).forEach(l => r[l.cod] = (r[l.cod] || 0) + l.rest);
  return r;
}
const pecasNaObra = oid => Object.values(saldoObra(oid)).reduce((a, b) => a + b, 0);
const totalCot = c => c.linhas.reduce((s, l) => s + l.qtd * artigo(l.cod).preco * c.dias, 0);
const totalFat = f => f.linhas.reduce((s, l) => s + l.valor, 0);
const nomeCliente = id => cliente(id)?.nome ?? '—';

/* ---------------- Regras de negócio ---------------- */
function criarCotacao({ nome, local, dias, data, linhas }) {
  const c = { id: nextId('COT'), nome, local, dias: +dias, data, linhas: linhas.map(l => ({ cod: l.cod, qtd: +l.qtd })), estado: 'Pendente' };
  S.cotacoes.unshift(c);
  return c;
}

function criarCliente(d) {
  const c = { id: nextId('CL'), tipo: d.tipo, nome: d.nome, nuit: d.nuit || '', morada: d.morada || '', alvara: d.alvara || '', contactos: d.contactos || '' };
  S.clientes.push(c);
  return c;
}
function criarObra(clienteId, nome, local) {
  const o = { id: nextId('OB'), clienteId, nome, local };
  S.obras.push(o);
  return o;
}

/* RF10–RF12, RF22, RF23 — guia de entrega + fatura por obra no levantamento */
function emitirEntrega({ obraId, data, linhas, matricula, motorista, apontador, cotacaoId, diasPrev }) {
  if (!obraId) throw new Error('Indique a obra de destino (RF12).');
  const ls = linhas.filter(l => l.cod && +l.qtd > 0).map(l => ({ cod: l.cod, qtd: +l.qtd }));
  if (!ls.length) throw new Error('Adicione pelo menos um artigo com quantidade.');
  const soma = {};
  ls.forEach(l => soma[l.cod] = (soma[l.cod] || 0) + l.qtd);
  for (const cod in soma) if (soma[cod] > emArmazem(cod)) throw new Error(`Stock insuficiente de ${cod}: pedido ${soma[cod]}, em armazém ${emArmazem(cod)}.`);

  const g = { num: nextId('GE'), tipo: 'Entrega', obraId, data, linhas: ls, matricula, motorista, apontador, cotacaoId: cotacaoId || null, diasPrev: +diasPrev };
  S.guias.push(g);
  ls.forEach(l => S.lotes.push({ obraId, cod: l.cod, data, qtd: l.qtd, rest: l.qtd, guia: g.num, diasPrev: +diasPrev, preco: artigo(l.cod).preco }));

  const f = {
    num: nextId('FT'), obraId, data, guia: g.num, tipo: 'Aluguer',
    linhas: ls.map(l => { const a = artigo(l.cod); return { cod: l.cod, desc: `${a.desc} — ${diasPrev} dias previstos`, qtd: l.qtd, dias: +diasPrev, preco: a.preco, valor: l.qtd * +diasPrev * a.preco }; })
  };
  S.faturas.push(f);
  if (cotacaoId) { const c = S.cotacoes.find(c => c.id === cotacaoId); if (c) c.guia = g.num; }
  return { g, f };
}

/* RF13, RF16, RF21, RF26, RF27 — devolução, acerto pelos dias reais, danos e perdas */
function registarDevolucao({ obraId, data, linhas, matricula, motorista, apontador, danos, obs }) {
  if (!obraId) throw new Error('Indique a obra de origem.');
  const saldo = saldoObra(obraId);
  const ls = linhas.map(l => ({ cod: l.cod, qtd: +l.qtd || 0, danif: +l.danif || 0, perd: +l.perd || 0 })).filter(l => l.qtd + l.perd > 0);
  if (!ls.length) throw new Error('Indique as quantidades devolvidas.');
  for (const l of ls) {
    if (l.qtd + l.perd > (saldo[l.cod] || 0)) throw new Error(`${l.cod}: a obra só tem ${saldo[l.cod] || 0} peças.`);
    if (l.danif > l.qtd) throw new Error(`${l.cod}: as danificadas não podem ser mais que as devolvidas.`);
  }
  const lotes0 = S.lotes.filter(x => x.obraId === obraId && x.rest > 0);
  if (lotes0.some(x => x.data > data)) {
    const min = lotes0.filter(x => ls.some(l => l.cod === x.cod)).map(x => x.data).sort()[0];
    if (min && min > data) throw new Error('A data de devolução é anterior ao levantamento.');
  }

  const g = { num: nextId('GD'), tipo: 'Devolução', obraId, data, linhas: ls, matricula, motorista, apontador, danos: +danos || 0, obs: obs || '' };
  S.guias.push(g);

  const acertos = [];
  ls.forEach(l => {
    let falta = l.qtd + l.perd;
    const lotes = S.lotes.filter(x => x.obraId === obraId && x.cod === l.cod && x.rest > 0 && x.data <= data).sort((a, b) => a.data.localeCompare(b.data));
    for (const lote of lotes) {
      if (!falta) break;
      const t = Math.min(falta, lote.rest);
      lote.rest -= t; falta -= t;
      const reais = diasCobrados(lote.data, data);
      const dif = reais - lote.diasPrev;
      if (dif !== 0) acertos.push({ cod: l.cod, desc: `Acerto ${lote.guia}: ${reais} dias reais − ${lote.diasPrev} previstos`, qtd: t, dias: dif, preco: lote.preco, valor: t * dif * lote.preco });
    }
    if (l.perd) artigo(l.cod).total -= l.perd;   // peças perdidas saem do inventário
  });
  if (g.danos) acertos.push({ cod: '', desc: 'Danos e perdas — valor acordado com o cliente', qtd: 1, dias: null, preco: g.danos, valor: g.danos });

  let f = null;
  if (acertos.length) {
    f = { num: nextId('FT'), obraId, data, guia: g.num, tipo: 'Acerto de devolução', linhas: acertos };
    S.faturas.push(f);
  }
  return { g, f };
}

/* ---------------- Dados de exemplo ---------------- */
function dadosExemplo() {
  S = estadoVazio();
  const c1 = criarCliente({ tipo: 'Empresa', nome: 'Construtora Limpopo, Lda', nuit: '401234567', morada: 'Av. Julius Nyerere, 850, Maputo', alvara: 'Alvará de 3.ª classe n.º 1234/2024', contactos: '+258 84 123 4567 · obras@limpopo.co.mz' });
  const c2 = criarCliente({ tipo: 'Particular', nome: 'João Mabunda', morada: 'Bairro da Liberdade, Matola', contactos: '+258 82 765 4321' });
  const o1 = criarObra(c1.id, 'Edifício Sommerschield', 'Maputo — Rua da Kaswende, Sommerschield');
  const o2 = criarObra(c1.id, 'Ponte do Limpopo', 'Gaza — Xai-Xai');
  const o3 = criarObra(c1.id, 'Escola Primária da Maxixe', 'Inhambane — Maxixe');
  const o4 = criarObra(c2.id, 'Moradia Mabunda', 'Matola — Bairro da Liberdade');

  const ap = (c, cl, ob) => { c.estado = 'Aprovada'; c.clienteId = cl.id; c.obraId = ob.id; };
  const q1 = criarCotacao({ nome: 'Construtora Limpopo', local: 'Sommerschield, Maputo', dias: 30, data: '2026-09-28', linhas: [{ cod: 'PR-250', qtd: 120 }, { cod: 'TR-250', qtd: 80 }, { cod: 'CH-150', qtd: 60 }] }); ap(q1, c1, o1);
  const q2 = criarCotacao({ nome: 'Construtora Limpopo', local: 'Xai-Xai, Gaza', dias: 30, data: '2026-10-08', linhas: [{ cod: 'PR-200', qtd: 100 }, { cod: 'TR-100', qtd: 150 }] }); ap(q2, c1, o2);
  const q3 = criarCotacao({ nome: 'Construtora Limpopo', local: 'Maxixe, Inhambane', dias: 20, data: '2026-10-30', linhas: [{ cod: 'CH-120', qtd: 80 }, { cod: 'PR-200', qtd: 60 }] }); ap(q3, c1, o3);
  const q4 = criarCotacao({ nome: 'João Mabunda', local: 'Matola', dias: 15, data: '2026-11-03', linhas: [{ cod: 'PR-200', qtd: 20 }, { cod: 'TR-100', qtd: 30 }] }); ap(q4, c2, o4);
  const q5 = criarCotacao({ nome: 'Hotel Costa Azul', local: 'Vilankulo', dias: 45, data: '2026-11-12', linhas: [{ cod: 'TR-250', qtd: 200 }, { cod: 'BR-FIX', qtd: 400 }] }); q5.estado = 'Rejeitada';
  criarCotacao({ nome: 'Armando Cossa', local: 'Marracuene', dias: 10, data: '2026-11-19', linhas: [{ cod: 'PR-200', qtd: 30 }, { cod: 'CH-120', qtd: 20 }] });
  criarCotacao({ nome: 'Pedro Langa', local: 'Boane', dias: 21, data: '2026-11-20', linhas: [{ cod: 'TR-100', qtd: 60 }, { cod: 'BR-GIR', qtd: 120 }] });

  const t = { matricula: 'AFG 123 MC', motorista: 'Carlos Muianga', apontador: 'Rui Sitoe' };
  emitirEntrega({ ...t, obraId: o1.id, data: '2026-10-01', diasPrev: 30, cotacaoId: q1.id, linhas: q1.linhas });
  emitirEntrega({ ...t, matricula: 'ADM 456 MP', obraId: o2.id, data: '2026-10-10', diasPrev: 30, cotacaoId: q2.id, linhas: q2.linhas });
  registarDevolucao({ ...t, obraId: o1.id, data: '2026-10-25', linhas: [{ cod: 'PR-250', qtd: 40 }, { cod: 'TR-250', qtd: 18, perd: 2 }], danos: 1200, obs: '2 travessas perdidas em obra' });
  emitirEntrega({ ...t, obraId: o3.id, data: '2026-11-03', diasPrev: 20, cotacaoId: q3.id, linhas: q3.linhas });
  emitirEntrega({ ...t, obraId: o4.id, data: '2026-11-05', diasPrev: 15, cotacaoId: q4.id, linhas: q4.linhas });
  emitirEntrega({ ...t, obraId: o1.id, data: '2026-11-10', diasPrev: 30, linhas: [{ cod: 'BR-FIX', qtd: 300 }, { cod: 'PR-250', qtd: 30 }] });
  registarDevolucao({ ...t, obraId: o4.id, data: '2026-11-18', linhas: [{ cod: 'PR-200', qtd: 20 }, { cod: 'TR-100', qtd: 30, danif: 2 }], danos: 800, obs: '2 travessas dobradas' });
  registarDevolucao({ ...t, obraId: o2.id, data: '2026-11-12', linhas: [{ cod: 'TR-100', qtd: 50 }] });
  return S;
}

/* ---------------- Perfis (6.2) ---------------- */
const TODOS = ['admin', 'apontador', 'faturacao'];
const MENU = [
  ['painel', 'Painel', TODOS],
  ['cotacoes', 'Cotações', ['admin', 'faturacao']],
  ['clientes', 'Clientes e obras', TODOS],
  ['guias', 'Guias', ['admin', 'apontador']],
  ['faturas', 'Faturas', ['admin', 'faturacao']],
  ['relatorios', 'Relatórios', ['admin', 'faturacao']],
  ['artigos', 'Inventário de artigos', TODOS],
  ['config', 'Configurações', ['admin']]
];
const pode = acc => ({
  guia: ['admin', 'apontador'], fatura: ['admin', 'faturacao'], cotacao: ['admin', 'faturacao'],
  artigo: ['admin'], cliente: ['admin', 'faturacao']
}[acc] || []).includes(S.perfil);

/* ---------------- Interface ---------------- */
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function pill(estado) {
  const m = { Activo: 'p-ok', Pendente: 'p-warn', Aprovada: 'p-ok', Rejeitada: 'p-mute', Entrega: 'p-info', 'Devolução': 'p-ok', Aluguer: 'p-info', 'Acerto de devolução': 'p-warn', Empresa: 'p-info', Particular: 'p-mute' };
  return `<span class="pill ${m[estado] || 'p-mute'}">${esc(estado)}</span>`;
}
function modal(titulo, corpo, rodape = '', wide = false) {
  $('#modalRoot').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)fecharModal()"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="modal-h"><h2>${esc(titulo)}</h2><button class="x" onclick="fecharModal()" aria-label="Fechar">×</button></div>
    <div class="modal-b" id="mb">${corpo}</div>
    <div class="modal-f">${rodape}</div></div></div>`;
}
function fecharModal() { $('#modalRoot').innerHTML = ''; M = null; }
function imprimir() {
  try { window.print(); } catch (e) {}
  toast('Se a impressão não abrir aqui, abra o index.html no navegador do computador.');
}
const optArtigos = sel => S.artigos.map(a => `<option value="${a.cod}" ${a.cod === sel ? 'selected' : ''}>${a.cod} — ${esc(a.desc)}</option>`).join('');
const optClientes = sel => `<option value="">Seleccione…</option>` + S.clientes.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
const optObras = (cid, sel) => `<option value="">Seleccione a obra…</option>` + obrasDe(cid).map(o => `<option value="${o.id}" ${o.id === sel ? 'selected' : ''}>${esc(o.nome)} — ${esc(o.local)}</option>`).join('');

function rota() { return (location.hash || '#painel').slice(1); }
const utilizadorActual = () => S.utilizadores.find(u => u.user === S.sessao && u.activo);
function mostrarLogin() {
  $('#app').hidden = true; $('#login').hidden = false; fecharModal();
  $('#loginBrand').textContent = S.empresa.nome.replace(/,? ?Lda\.?$/, '');
  $('#demoUsers').innerHTML = S.utilizadores.filter(u => u.activo).map(u =>
    `<button type="button" onclick="preencherLogin('${esc(u.user)}')"><span><b>${esc(NOME_PERFIL[u.perfil])}</b> · ${esc(u.nome)}</span><code>${esc(u.user)} / ${esc(u.pass)}</code></button>`).join('');
  $('#lUser').focus();
}
function preencherLogin(user) {
  const u = S.utilizadores.find(x => x.user === user);
  $('#lUser').value = u.user; $('#lPass').value = u.pass; $('#loginErr').textContent = '';
}
function entrar(e) {
  e.preventDefault();
  const user = $('#lUser').value.trim().toLowerCase(), pass = $('#lPass').value;
  const u = S.utilizadores.find(x => x.user === user && x.activo);
  if (!u || u.pass !== pass) { $('#loginErr').textContent = 'Utilizador ou palavra-passe incorrectos.'; $('#lPass').value = ''; $('#lPass').focus(); return; }
  S.sessao = u.user; S.perfil = u.perfil; guardar();
  $('#lPass').value = ''; $('#loginErr').textContent = '';
  location.hash = '#painel'; render();
  toast(`Bem-vindo(a), ${u.nome}.`);
}
function sair() { S.sessao = null; S.perfil = null; guardar(); history.replaceState(null, '', location.pathname); mostrarLogin(); }

function render() {
  const eu = utilizadorActual();
  if (!eu) return mostrarLogin();
  S.perfil = eu.perfil;
  $('#login').hidden = true; $('#app').hidden = false;
  $('#userName').textContent = eu.nome;
  $('#userRole').textContent = NOME_PERFIL[eu.perfil];
  const r = rota();
  const base = r.startsWith('obra-') ? 'clientes' : r;
  const item = MENU.find(m => m[0] === base);
  if (!item || !item[2].includes(S.perfil)) { location.hash = '#painel'; return; }
  $('#brandName').textContent = S.empresa.nome.replace(/,? ?Lda\.?$/, '');
  const pend = S.cotacoes.filter(c => c.estado === 'Pendente').length;
  $('#nav').innerHTML = MENU.filter(m => m[2].includes(S.perfil)).map(m =>
    `<a href="#${m[0]}" class="${m[0] === base ? 'on' : ''}">${m[1]}${m[0] === 'cotacoes' && pend ? `<span class="badge">${pend}</span>` : ''}</a>`).join('');
  const views = { painel: vPainel, cotacoes: vCotacoes, clientes: vClientes, guias: vGuias, faturas: vFaturas, relatorios: vRelatorios, artigos: vArtigos, config: vConfig };
  $('#main').innerHTML = r.startsWith('obra-') ? vObra(r.slice(5)) : views[base]();
  $('#main').scrollTop = 0;
}
function salvarERender() { guardar(); render(); }

/* ---------- Painel ---------- */
function vPainel() {
  const h = hoje(), mes = h.slice(0, 7);
  const totalAlug = S.artigos.reduce((s, a) => s + alugado(a.cod), 0);
  const totalPecas = S.artigos.reduce((s, a) => s + a.total, 0);
  const obrasAct = S.obras.filter(o => pecasNaObra(o.id) > 0);
  const fatMes = S.faturas.filter(f => f.data.slice(0, 7) === mes).reduce((s, f) => s + totalFat(f), 0);
  const pend = S.cotacoes.filter(c => c.estado === 'Pendente');
  const ult = [...S.guias].sort((a, b) => b.data.localeCompare(a.data) || b.num.localeCompare(a.num)).slice(0, 6);
  return `
  <div class="head"><div><h1>Painel</h1><p>Situação do material e da faturação em ${dt(h)}</p></div>
    <div class="actions">
      ${pode('cotacao') ? `<button class="btn" onclick="novaCotacao()">Nova cotação</button>` : ''}
      ${pode('guia') ? `<button class="btn" onclick="novaDevolucao()">Registar devolução</button><button class="btn pri" onclick="novaEntrega()">Nova guia de entrega</button>` : ''}
    </div></div>
  <div class="grid g4">
    <div class="card kpi"><span class="lbl">Peças alugadas</span><span class="val">${nf(totalAlug)}</span><span class="sub">${Math.round(totalAlug / totalPecas * 100)}% do parque de ${nf(totalPecas)} peças</span></div>
    <div class="card kpi"><span class="lbl">Obras com material</span><span class="val">${obrasAct.length}</span><span class="sub">de ${S.obras.length} obras registadas</span></div>
    <div class="card kpi"><span class="lbl">Faturado este mês</span><span class="val">${mt(fatMes).replace(' MT', '')}</span><span class="sub">MT, sem IVA (RF24)</span></div>
    <div class="card kpi"><span class="lbl">Cotações pendentes</span><span class="val">${pend.length}</span><span class="sub">${pend.map(c => esc(c.nome)).join(', ') || 'nenhuma'}</span></div>
  </div>
  <div class="grid g2">
    <div class="card"><h3>Ocupação do parque por artigo</h3>
      ${S.artigos.map(a => { const al = alugado(a.cod); return `<div class="stock-row"><span><span class="code">${a.cod}</span> <span class="muted">${a.medida}</span></span><div class="bar" title="${al} de ${a.total} alugadas"><span style="width:${a.total ? al / a.total * 100 : 0}%"></span></div><span class="num">${nf(al)} / ${nf(a.total)}</span></div>`; }).join('')}
    </div>
    <div class="card"><h3>Últimos movimentos</h3>
      <div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Guia</th><th>Obra</th><th class="n">Peças</th></tr></thead><tbody>
      ${ult.map(g => { const o = obra(g.obraId); const q = g.linhas.reduce((s, l) => s + l.qtd + (l.perd || 0), 0); return `<tr><td>${dt(g.data)}</td><td><button class="btn ghost sm" onclick="verGuia('${g.num}')">${g.num}</button> ${pill(g.tipo)}</td><td><a href="#obra-${o.id}">${esc(o.nome)}</a><div class="muted" style="font-size:12px">${esc(nomeCliente(o.clienteId))}</div></td><td class="n">${g.tipo === 'Entrega' ? '+' : '−'}${nf(q)}</td></tr>`; }).join('')}
      </tbody></table></div>
    </div>
  </div>`;
}

/* ---------- Cotações (RF05, RF06) ---------- */
function vCotacoes() {
  return `<div class="head"><div><h1>Cotações</h1><p>O interessado fica registado só pelo nome. Passa a cliente apenas quando a cotação é aprovada.</p></div>
    <div class="actions"><button class="btn pri" onclick="novaCotacao()">Nova cotação</button></div></div>
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>N.º</th><th>Data</th><th>Interessado</th><th>Local previsto</th><th class="n">Dias</th><th class="n">Valor estimado</th><th>Estado</th><th></th></tr></thead><tbody>
  ${S.cotacoes.map(c => `<tr><td class="code">${c.id}</td><td>${dt(c.data)}</td><td><b>${esc(c.nome)}</b>${c.clienteId ? `<div class="muted" style="font-size:12px">Cliente: ${esc(nomeCliente(c.clienteId))}</div>` : ''}</td><td>${esc(c.local)}</td><td class="n">${c.dias}</td><td class="n">${mt(totalCot(c))}</td><td>${pill(c.estado)}</td>
    <td style="white-space:nowrap;text-align:right"><button class="btn sm" onclick="verCotacao('${c.id}')">Ver</button>
    ${c.estado === 'Pendente' ? `<button class="btn sm pri" onclick="aprovarCotacao('${c.id}')">Aprovar</button> <button class="btn sm danger" onclick="rejeitarCotacao('${c.id}')">Rejeitar</button>` : ''}
    ${c.estado === 'Aprovada' && !c.guia && pode('guia') ? `<button class="btn sm pri" onclick="novaEntrega('${c.id}')">Gerar guia</button>` : ''}
    ${c.guia ? `<button class="btn sm ghost" onclick="verGuia('${c.guia}')">${c.guia}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}
function linhasEditor() {
  return `<div class="tbl-wrap"><table><thead><tr><th>Artigo</th><th class="n">Em armazém</th><th class="n">Preço/dia</th><th class="n">Quantidade</th><th></th></tr></thead><tbody>
  ${M.linhas.map((l, i) => { const a = artigo(l.cod); return `<tr><td><select id="art${i}" onchange="M.linhas[${i}].cod=this.value;redesenhar()">${optArtigos(l.cod)}</select></td><td class="n">${nf(emArmazem(l.cod))}</td><td class="n">${mt(a.preco)}</td>
    <td class="n"><input id="qtd${i}" type="number" min="0" value="${l.qtd}" oninput="M.linhas[${i}].qtd=+this.value;actTotal()"></td><td><button class="btn sm ghost" onclick="M.linhas.splice(${i},1);redesenhar()" aria-label="Remover linha">Remover</button></td></tr>`; }).join('')}
  </tbody></table></div><div><button class="btn sm" onclick="M.linhas.push({cod:'${S.artigos[0].cod}',qtd:1});redesenhar()">+ Adicionar artigo</button></div>`;
}
function novaCotacao() {
  M = { tipo: 'cot', nome: '', local: '', dias: S.diasPrevPadrao, data: hoje(), linhas: [{ cod: 'PR-200', qtd: 10 }] };
  modal('Nova cotação', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarCotacao()">Gravar cotação</button>`, true);
  redesenhar();
}
function corpoCotacao() {
  return `<div class="form">
    <div class="field"><label for="cNome">Nome do interessado</label><input id="cNome" value="${esc(M.nome)}" oninput="M.nome=this.value" placeholder="Ex.: Armando Cossa"></div>
    <div class="field"><label for="cData">Data</label><input id="cData" type="date" value="${M.data}" oninput="M.data=this.value"></div>
    <div class="field"><label for="cLocal">Local previsto da obra</label><input id="cLocal" value="${esc(M.local)}" oninput="M.local=this.value"></div>
    <div class="field"><label for="cDias">Dias de aluguer previstos</label><input id="cDias" type="number" min="1" value="${M.dias}" oninput="M.dias=+this.value;actTotal()"></div>
  </div>${linhasEditor()}<div class="toolbar" style="justify-content:flex-end"><span class="muted">Valor estimado (sem IVA):</span> <b id="mTotal" class="num"></b></div>`;
}
function actTotal() {
  const el = $('#mTotal'); if (!el) return;
  const dias = M.tipo === 'cot' ? M.dias : M.diasPrev;
  el.textContent = mt(M.linhas.reduce((s, l) => s + (+l.qtd || 0) * artigo(l.cod).preco * (+dias || 0), 0));
}
function gravarCotacao() {
  if (!M.nome.trim()) return toast('Indique o nome do interessado.');
  if (!M.linhas.some(l => l.qtd > 0)) return toast('Adicione pelo menos um artigo.');
  const c = criarCotacao({ ...M, linhas: M.linhas.filter(l => l.qtd > 0) });
  fecharModal(); salvarERender(); toast(`Cotação ${c.id} gravada.`);
}
function rejeitarCotacao(id) { S.cotacoes.find(c => c.id === id).estado = 'Rejeitada'; salvarERender(); toast('Cotação rejeitada. O interessado não foi registado como cliente.'); }

function aprovarCotacao(id) {
  const c = S.cotacoes.find(c => c.id === id);
  const existente = S.clientes.find(x => x.nome.toLowerCase().includes(c.nome.toLowerCase()) || c.nome.toLowerCase().includes(x.nome.toLowerCase().replace(/,? ?lda\.?/, '')));
  M = { tipo: 'apr', cot: id, modo: existente ? 'existente' : 'novo', clienteId: existente?.id || '', obraModo: 'nova', obraId: '',
    cli: { tipo: 'Empresa', nome: c.nome, nuit: '', morada: '', alvara: '', contactos: '' }, obraNome: '', obraLocal: c.local };
  modal(`Aprovar ${id} — ${c.nome}`, '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="confirmarAprovacao()">Aprovar e criar cliente</button>`);
  redesenhar();
}
function corpoAprovacao() {
  const cli = M.cli;
  return `<div class="note">Ao aprovar, o interessado passa a cliente com os dados completos (RF06) e a cotação fica ligada a uma obra.</div>
  <div class="seg"><button class="${M.modo === 'novo' ? 'on' : ''}" onclick="M.modo='novo';redesenhar()">Novo cliente</button><button class="${M.modo === 'existente' ? 'on' : ''}" onclick="M.modo='existente';redesenhar()">Cliente existente</button></div>
  ${M.modo === 'novo' ? `
  <div class="form">
    <div class="field full"><label>Tipo de cliente</label><div class="seg"><button class="${cli.tipo === 'Particular' ? 'on' : ''}" onclick="M.cli.tipo='Particular';redesenhar()">Particular</button><button class="${cli.tipo === 'Empresa' ? 'on' : ''}" onclick="M.cli.tipo='Empresa';redesenhar()">Empresa</button></div></div>
    <div class="field ${cli.tipo === 'Particular' ? 'full' : ''}"><label for="aNome">Nome${cli.tipo === 'Empresa' ? ' da empresa' : ''}</label><input id="aNome" value="${esc(cli.nome)}" oninput="M.cli.nome=this.value"></div>
    ${cli.tipo === 'Empresa' ? `<div class="field"><label for="aNuit">NUIT</label><input id="aNuit" value="${esc(cli.nuit)}" oninput="M.cli.nuit=this.value" inputmode="numeric" maxlength="9"></div>` : ''}
    <div class="field full"><label for="aMor">Morada</label><input id="aMor" value="${esc(cli.morada)}" oninput="M.cli.morada=this.value"></div>
    ${cli.tipo === 'Empresa' ? `<div class="field"><label for="aAlv">Alvará (quando aplicável)</label><input id="aAlv" value="${esc(cli.alvara)}" oninput="M.cli.alvara=this.value"></div>` : ''}
    <div class="field ${cli.tipo === 'Particular' ? 'full' : ''}"><label for="aCont">Contactos</label><input id="aCont" value="${esc(cli.contactos)}" oninput="M.cli.contactos=this.value" placeholder="Telefone · email"></div>
  </div>` : `<div class="field"><label for="aCli">Cliente</label><select id="aCli" onchange="M.clienteId=this.value;M.obraId='';redesenhar()">${optClientes(M.clienteId)}</select></div>`}
  <h3>Obra de destino</h3>
  ${M.modo === 'existente' && M.clienteId && obrasDe(M.clienteId).length ? `<div class="seg"><button class="${M.obraModo === 'nova' ? 'on' : ''}" onclick="M.obraModo='nova';redesenhar()">Nova obra</button><button class="${M.obraModo === 'existente' ? 'on' : ''}" onclick="M.obraModo='existente';redesenhar()">Obra existente</button></div>` : ''}
  ${M.obraModo === 'existente' && M.modo === 'existente' && M.clienteId ? `<div class="field"><label for="aObra">Obra</label><select id="aObra" onchange="M.obraId=this.value">${optObras(M.clienteId, M.obraId)}</select></div>` :
  `<div class="form"><div class="field"><label for="oNome">Nome da obra</label><input id="oNome" value="${esc(M.obraNome)}" oninput="M.obraNome=this.value" placeholder="Ex.: Armazém de Marracuene"></div>
   <div class="field"><label for="oLoc">Local / centro de custo</label><input id="oLoc" value="${esc(M.obraLocal)}" oninput="M.obraLocal=this.value"></div></div>`}`;
}
function confirmarAprovacao() {
  const c = S.cotacoes.find(c => c.id === M.cot);
  let cl;
  if (M.modo === 'novo') {
    if (!M.cli.nome.trim()) return toast('Indique o nome do cliente.');
    if (M.cli.tipo === 'Empresa' && !/^\d{9}$/.test(M.cli.nuit)) return toast('O NUIT deve ter 9 dígitos.');
    if (!M.cli.contactos.trim()) return toast('Indique pelo menos um contacto.');
    cl = criarCliente(M.cli);
  } else {
    cl = cliente(M.clienteId); if (!cl) return toast('Seleccione o cliente.');
  }
  let ob;
  if (M.modo === 'existente' && M.obraModo === 'existente') { ob = obra(M.obraId); if (!ob) return toast('Seleccione a obra.'); }
  else { if (!M.obraNome.trim()) return toast('Indique o nome da obra.'); ob = criarObra(cl.id, M.obraNome, M.obraLocal || c.local); }
  c.estado = 'Aprovada'; c.clienteId = cl.id; c.obraId = ob.id;
  guardar(); fecharModal(); render();
  toast(`${c.id} aprovada. ${cl.nome} é agora cliente.`);
  if (pode('guia')) novaEntrega(c.id);
}

/* ---------- Guias (RF10–RF14) ---------- */
function vGuias() {
  const f = window._fg || 'Todas';
  const gs = [...S.guias].filter(g => f === 'Todas' || g.tipo === f).sort((a, b) => b.data.localeCompare(a.data) || b.num.localeCompare(a.num));
  return `<div class="head"><div><h1>Guias de entrega e devolução</h1><p>Cada guia indica obrigatoriamente a obra. Imprime-se em duas vias.</p></div>
    <div class="actions"><button class="btn" onclick="novaDevolucao()">Registar devolução</button><button class="btn pri" onclick="novaEntrega()">Nova guia de entrega</button></div></div>
  <div class="seg">${['Todas', 'Entrega', 'Devolução'].map(x => `<button class="${f === x ? 'on' : ''}" onclick="window._fg='${x}';render()">${x}</button>`).join('')}</div>
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>N.º</th><th>Tipo</th><th>Data</th><th>Cliente</th><th>Obra</th><th class="n">Peças</th><th>Viatura</th><th></th></tr></thead><tbody>
  ${gs.map(g => { const o = obra(g.obraId); return `<tr><td class="code">${g.num}</td><td>${pill(g.tipo)}</td><td>${dt(g.data)}</td><td>${esc(nomeCliente(o.clienteId))}</td><td><a href="#obra-${o.id}">${esc(o.nome)}</a></td><td class="n">${nf(g.linhas.reduce((s, l) => s + l.qtd + (l.perd || 0), 0))}</td><td>${esc(g.matricula)}</td><td style="text-align:right"><button class="btn sm" onclick="verGuia('${g.num}')">Ver / imprimir</button></td></tr>`; }).join('') || `<tr><td colspan="8" class="empty">Sem guias.</td></tr>`}
  </tbody></table></div></div>`;
}
function novaEntrega(cotId) {
  const c = cotId ? S.cotacoes.find(c => c.id === cotId) : null;
  M = { tipo: 'ge', cotacaoId: cotId || '', clienteId: c?.clienteId || '', obraId: c?.obraId || '', data: hoje(), diasPrev: c?.dias || S.diasPrevPadrao,
    matricula: '', motorista: '', apontador: S.perfil === 'apontador' ? utilizadorActual().nome : '', linhas: c ? c.linhas.map(l => ({ ...l })) : [{ cod: 'PR-200', qtd: 10 }] };
  modal(c ? `Guia de entrega — a partir de ${c.id}` : 'Nova guia de entrega', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarEntrega()">Emitir guia e fatura</button>`, true);
  redesenhar();
}
function corpoEntrega() {
  return `<div class="form">
    <div class="field"><label for="gCli">Cliente</label><select id="gCli" onchange="M.clienteId=this.value;M.obraId='';redesenhar()">${optClientes(M.clienteId)}</select></div>
    <div class="field"><label for="gObra">Obra de destino (obrigatória)</label><select id="gObra" onchange="M.obraId=this.value" ${M.clienteId ? '' : 'disabled'}>${optObras(M.clienteId, M.obraId)}</select></div>
    <div class="field"><label for="gData">Data de carregamento (levantamento)</label><input id="gData" type="date" value="${M.data}" oninput="M.data=this.value"></div>
    <div class="field"><label for="gDias">Dias previstos (para a fatura)</label><input id="gDias" type="number" min="1" value="${M.diasPrev}" oninput="M.diasPrev=+this.value;actTotal()"></div>
    <div class="field"><label for="gMat">Matrícula da viatura</label><input id="gMat" value="${esc(M.matricula)}" oninput="M.matricula=this.value" placeholder="AAA 000 MC"></div>
    <div class="field"><label for="gMot">Motorista</label><input id="gMot" value="${esc(M.motorista)}" oninput="M.motorista=this.value"></div>
    <div class="field"><label for="gApo">Apontador</label><input id="gApo" value="${esc(M.apontador)}" oninput="M.apontador=this.value"></div>
  </div>${linhasEditor()}
  <div class="toolbar" style="justify-content:space-between"><span class="muted">A fatura da obra é emitida agora, pelos dias previstos. Na devolução faz-se o acerto pelos dias reais.</span><span><span class="muted">Fatura:</span> <b id="mTotal" class="num"></b></span></div>`;
}
function gravarEntrega() {
  if (!M.matricula || !M.motorista || !M.apontador) return toast('Preencha matrícula, motorista e apontador.');
  try {
    const { g, f } = emitirEntrega(M);
    fecharModal(); salvarERender(); toast(`${g.num} emitida e fatura ${f.num} gerada.`); verGuia(g.num);
  } catch (e) { toast(e.message); }
}
function novaDevolucao(obraId) {
  const o = obraId ? obra(obraId) : null;
  M = { tipo: 'gd', clienteId: o?.clienteId || '', obraId: obraId || '', data: hoje(), matricula: '', motorista: '', apontador: S.perfil === 'apontador' ? utilizadorActual().nome : '', danos: 0, obs: '', linhas: {} };
  modal('Registar devolução', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarDevolucao()">Registar devolução</button>`, true);
  redesenhar();
}
function corpoDevolucao() {
  const saldo = M.obraId ? saldoObra(M.obraId) : {};
  const cods = Object.keys(saldo);
  return `<div class="form">
    <div class="field"><label for="dCli">Cliente</label><select id="dCli" onchange="M.clienteId=this.value;M.obraId='';M.linhas={};redesenhar()">${optClientes(M.clienteId)}</select></div>
    <div class="field"><label for="dObra">Obra de origem</label><select id="dObra" onchange="M.obraId=this.value;M.linhas={};redesenhar()" ${M.clienteId ? '' : 'disabled'}>${optObras(M.clienteId, M.obraId)}</select></div>
    <div class="field"><label for="dData">Data de devolução</label><input id="dData" type="date" value="${M.data}" oninput="M.data=this.value"></div>
    <div class="field"><label for="dMat">Matrícula da viatura</label><input id="dMat" value="${esc(M.matricula)}" oninput="M.matricula=this.value"></div>
    <div class="field"><label for="dMot">Motorista</label><input id="dMot" value="${esc(M.motorista)}" oninput="M.motorista=this.value"></div>
    <div class="field"><label for="dApo">Apontador</label><input id="dApo" value="${esc(M.apontador)}" oninput="M.apontador=this.value"></div>
  </div>
  ${M.obraId ? (cods.length ? `<div class="tbl-wrap"><table><thead><tr><th>Artigo</th><th class="n">Na obra</th><th class="n">Devolvidas</th><th class="n">Das quais danificadas</th><th class="n">Perdidas</th><th></th></tr></thead><tbody>
    ${cods.map(cod => { const l = M.linhas[cod] || (M.linhas[cod] = { cod, qtd: 0, danif: 0, perd: 0 }); return `<tr><td><span class="code">${cod}</span> ${esc(artigo(cod).desc)}</td><td class="n">${nf(saldo[cod])}</td>
      <td class="n"><input id="dq-${cod}" type="number" min="0" max="${saldo[cod]}" value="${l.qtd}" oninput="M.linhas['${cod}'].qtd=+this.value"></td>
      <td class="n"><input id="dd-${cod}" type="number" min="0" value="${l.danif}" oninput="M.linhas['${cod}'].danif=+this.value"></td>
      <td class="n"><input id="dp-${cod}" type="number" min="0" value="${l.perd}" oninput="M.linhas['${cod}'].perd=+this.value"></td>
      <td><button class="btn sm ghost" onclick="M.linhas['${cod}'].qtd=${saldo[cod]};redesenhar()">Tudo</button></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="form"><div class="field"><label for="dDan">Valor a cobrar por danos e perdas (MT, acordado com o cliente)</label><input id="dDan" type="number" min="0" value="${M.danos}" oninput="M.danos=+this.value"></div>
    <div class="field"><label for="dObs">Observações</label><input id="dObs" value="${esc(M.obs)}" oninput="M.obs=this.value" placeholder="Ex.: 2 chapas empenadas"></div></div>
    <div class="note">Ao registar, o sistema calcula o acerto peça a peça e lote a lote: dias reais (sem contar o dia de levantamento nem o de devolução) menos os dias já faturados.</div>`
    : `<div class="empty">Esta obra não tem material no local.</div>`) : `<div class="empty">Seleccione o cliente e a obra para ver o material no local.</div>`}`;
}
function gravarDevolucao() {
  try {
    const { g, f } = registarDevolucao({ ...M, linhas: Object.values(M.linhas) });
    fecharModal(); salvarERender();
    toast(f ? `${g.num} registada. Fatura de acerto ${f.num}: ${mt(totalFat(f))}.` : `${g.num} registada. Sem acerto a faturar.`);
    verGuia(g.num);
  } catch (e) { toast(e.message); }
}
function redesenhar() {
  const b = $('#mb'); if (!b || !M) return;
  b.innerHTML = { cot: corpoCotacao, apr: corpoAprovacao, ge: corpoEntrega, gd: corpoDevolucao, art: corpoArtigo, cli: corpoCliente, ob: corpoObra, usr: corpoUtilizador }[M.tipo]();
  actTotal();
}

/* ---------- Documentos para impressão ---------- */
function cabecalho(titulo, num, extra = '') {
  const e = S.empresa;
  return `<div class="doc-top"><div><b style="font-size:15px">${esc(e.nome)}</b><br>NUIT ${esc(e.nuit)}<br>${esc(e.morada)}<br>${esc(e.contactos)}</div>
    <div style="text-align:right"><div class="doc-title">${titulo}</div><div class="code" style="font-size:14px">${num}</div>${extra}</div></div>`;
}
function blocoCliente(c, o) {
  return `<div class="doc-cols"><div class="doc-box"><b>Cliente</b>${esc(c.nome)}${c.nuit ? `<br>NUIT ${esc(c.nuit)}` : ''}<br>${esc(c.morada)}${c.alvara ? `<br>${esc(c.alvara)}` : ''}<br>${esc(c.contactos)}</div>
    <div class="doc-box"><b>Obra</b>${esc(o.nome)}<br>${esc(o.local)}<br><span style="color:#666">Ref. ${o.id}</span></div></div>`;
}
function docGuia(g, via) {
  const o = obra(g.obraId), c = cliente(o.clienteId), ent = g.tipo === 'Entrega';
  return `<div class="paper">${cabecalho(ent ? 'Guia de entrega' : 'Guia de devolução', g.num, `<div style="margin-top:4px"><span class="via">${via}</span></div>`)}
    ${blocoCliente(c, o)}
    <div class="doc-cols"><div class="doc-box"><b>${ent ? 'Data de carregamento' : 'Data de devolução'}</b>${dt(g.data)}</div>
      <div class="doc-box"><b>Transporte</b>Viatura ${esc(g.matricula)} · Motorista ${esc(g.motorista)} · Apontador ${esc(g.apontador)}</div></div>
    <table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Quantidade</th>${ent ? '' : '<th class="n">Danificadas</th><th class="n">Perdidas</th>'}</tr></thead><tbody>
    ${g.linhas.map(l => `<tr><td class="code">${l.cod}</td><td>${esc(artigo(l.cod).desc)}</td><td class="n">${nf(l.qtd)}</td>${ent ? '' : `<td class="n">${l.danif || '—'}</td><td class="n">${l.perd || '—'}</td>`}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Total de peças</td><td class="n">${nf(g.linhas.reduce((s, l) => s + l.qtd, 0))}</td>${ent ? '' : `<td></td><td class="n">${nf(g.linhas.reduce((s, l) => s + (l.perd || 0), 0)) || '—'}</td>`}</tr></tfoot></table>
    ${g.obs ? `<div><b>Observações:</b> ${esc(g.obs)}</div>` : ''}
    <div class="sigs"><div>O motorista</div><div>O apontador</div><div>O cliente / recebedor</div></div></div>`;
}
function verGuia(num) {
  const g = S.guias.find(x => x.num === num);
  modal(`${g.tipo === 'Entrega' ? 'Guia de entrega' : 'Guia de devolução'} ${g.num}`,
    docGuia(g, 'ORIGINAL — CLIENTE') + `<div class="cut">recortar · 2.ª via</div>` + docGuia(g, 'DUPLICADO — EMPRESA'),
    `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir 2 vias</button>`, true);
}
function docFatura(f) {
  const o = obra(f.obraId), c = cliente(o.clienteId);
  return `<div class="paper">${cabecalho('Fatura', f.num, `<div>Data: ${dt(f.data)}</div><div>Guia: ${f.guia}</div>`)}
    ${blocoCliente(c, o)}
    <div><b>${esc(f.tipo)}</b>${f.tipo === 'Aluguer' ? ' — emitida no levantamento, pelos dias previstos' : ' — diferença entre dias reais e dias faturados, e danos/perdas'}</div>
    <table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Dias</th><th class="n">Preço/dia</th><th class="n">Valor</th></tr></thead><tbody>
    ${f.linhas.map(l => `<tr><td class="code">${l.cod || '—'}</td><td>${esc(l.desc)}</td><td class="n">${nf(l.qtd)}</td><td class="n">${l.dias === null ? '—' : l.dias}</td><td class="n">${mt(l.preco)}</td><td class="n">${mt(l.valor)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="5">Total a pagar</td><td class="n">${mt(totalFat(f))}</td></tr></tfoot></table>
    <div style="color:#555">Valores sem IVA. Cálculo: quantidade × dias × preço diário, por lote levantado.</div></div>`;
}
function verFatura(num) {
  modal(`Fatura ${num}`, docFatura(S.faturas.find(f => f.num === num)), `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir</button>`, true);
}
function verCotacao(id) {
  const c = S.cotacoes.find(x => x.id === id);
  modal(`Cotação ${id}`, `<div class="paper">${cabecalho('Cotação', c.id, `<div>Data: ${dt(c.data)}</div>`)}
    <div class="doc-cols"><div class="doc-box"><b>Interessado</b>${esc(c.nome)}</div><div class="doc-box"><b>Local previsto · Período</b>${esc(c.local)} · ${c.dias} dias</div></div>
    <table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Preço/dia</th><th class="n">Dias</th><th class="n">Valor</th></tr></thead><tbody>
    ${c.linhas.map(l => { const a = artigo(l.cod); return `<tr><td class="code">${l.cod}</td><td>${esc(a.desc)}</td><td class="n">${nf(l.qtd)}</td><td class="n">${mt(a.preco)}</td><td class="n">${c.dias}</td><td class="n">${mt(l.qtd * a.preco * c.dias)}</td></tr>`; }).join('')}
    </tbody><tfoot><tr><td colspan="5">Total estimado</td><td class="n">${mt(totalCot(c))}</td></tr></tfoot></table>
    <div style="color:#555">Valores sem IVA. O valor final depende dos dias reais em obra.</div></div>`,
    `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir</button>`, true);
}

/* ---------- Clientes e obras (RF07–RF09) ---------- */
function vClientes() {
  return `<div class="head"><div><h1>Clientes e obras</h1><p>Cada obra tem o seu próprio movimento de material, saldo e faturação.</p></div>
    <div class="actions">${pode('cliente') ? `<button class="btn pri" onclick="novoCliente()">Novo cliente</button>` : ''}</div></div>
  ${S.clientes.map(c => `<div class="card">
    <div class="head"><div><h2>${esc(c.nome)} ${pill(c.tipo)}</h2><p>${c.nuit ? `NUIT ${esc(c.nuit)} · ` : ''}${esc(c.morada)} · ${esc(c.contactos)}${c.alvara ? ` · ${esc(c.alvara)}` : ''}</p></div>
      <div class="actions">${pode('cliente') ? `<button class="btn sm" onclick="novaObra('${c.id}')">+ Nova obra</button>` : ''}${pode('fatura') ? `<button class="btn sm" onclick="window._ff={cli:'${c.id}'};location.hash='#faturas'">Faturas do cliente</button>` : ''}</div></div>
    <div class="grid g3">${obrasDe(c.id).map(o => { const p = pecasNaObra(o.id); const fs = S.faturas.filter(f => f.obraId === o.id); return `
      <a href="#obra-${o.id}" class="card obra-card" style="text-decoration:none;color:inherit">
        <div><b>${esc(o.nome)}</b><div class="muted" style="font-size:12.5px">${esc(o.local)}</div></div>
        <div class="toolbar" style="justify-content:space-between"><span>${p ? `<span class="pill p-info">${nf(p)} peças no local</span>` : '<span class="pill p-mute">Sem material</span>'}</span>
        <span class="muted" style="font-size:12.5px">${fs.length} faturas · ${mt(fs.reduce((s, f) => s + totalFat(f), 0))}</span></div>
      </a>`; }).join('') || '<div class="empty">Sem obras.</div>'}</div></div>`).join('')}`;
}
function movimentosObra(oid) {
  const gs = S.guias.filter(g => g.obraId === oid).sort((a, b) => a.data.localeCompare(b.data) || a.num.localeCompare(b.num));
  const saldo = {}; let tot = 0; const rows = [];
  gs.forEach(g => g.linhas.forEach(l => {
    const q = g.tipo === 'Entrega' ? l.qtd : -(l.qtd + (l.perd || 0));
    saldo[l.cod] = (saldo[l.cod] || 0) + q; tot += q;
    rows.push({ g, l, q, saldoArt: saldo[l.cod], tot });
  }));
  return rows;
}
function tabelaMapa(oid) {
  const rows = movimentosObra(oid);
  return `<table><thead><tr><th>Data</th><th>Guia</th><th>Tipo</th><th>Código</th><th>Descrição</th><th class="n">Quantidade</th><th class="n">Saldo do artigo</th><th class="n">Saldo total</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td>${dt(r.g.data)}</td><td class="code">${r.g.num}</td><td>${r.g.tipo}</td><td class="code">${r.l.cod}</td><td>${esc(artigo(r.l.cod).desc)}${r.l.perd ? ` <span style="color:#b00">(${r.l.perd} perdidas)</span>` : ''}</td><td class="n">${r.q > 0 ? '+' : '−'}${nf(Math.abs(r.q))}</td><td class="n">${nf(r.saldoArt)}</td><td class="n"><b>${nf(r.tot)}</b></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sem movimentos.</td></tr>'}
  </tbody></table>`;
}
function tabelaInventario(oid) {
  const lotes = S.lotes.filter(l => l.obraId === oid && l.rest > 0).sort((a, b) => a.data.localeCompare(b.data));
  const h = hoje();
  return `<table><thead><tr><th>Código</th><th>Descrição</th><th>Guia</th><th>Levantado em</th><th class="n">Qtd no local</th><th class="n">Dias decorridos</th><th class="n">Dias faturados</th></tr></thead><tbody>
  ${lotes.map(l => { const d = Math.max(0, diasEntre(l.data, h)); return `<tr><td class="code">${l.cod}</td><td>${esc(artigo(l.cod).desc)}</td><td class="code">${l.guia}</td><td>${dt(l.data)}</td><td class="n">${nf(l.rest)}</td><td class="n">${d}</td><td class="n">${l.diasPrev}${d > l.diasPrev ? ' <span class="pill p-warn">excedido</span>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Sem material no local.</td></tr>'}
  </tbody>${lotes.length ? `<tfoot><tr><td colspan="4">Total no local</td><td class="n">${nf(lotes.reduce((s, l) => s + l.rest, 0))}</td><td colspan="2"></td></tr></tfoot>` : ''}</table>`;
}
function vObra(oid) {
  const o = obra(oid); if (!o) return `<div class="empty">Obra não encontrada.</div>`;
  const c = cliente(o.clienteId);
  const tab = window._to || 'mapa';
  const fs = S.faturas.filter(f => f.obraId === oid);
  return `<div class="head"><div><a href="#clientes" class="muted">← Clientes e obras</a><h1>${esc(o.nome)}</h1><p>${esc(c.nome)} · ${esc(o.local)} · ${o.id}</p></div>
    <div class="actions">${pode('guia') ? `<button class="btn" onclick="novaDevolucao('${oid}')">Registar devolução</button><button class="btn pri" onclick="novaEntregaObra('${oid}')">Nova entrega</button>` : ''}</div></div>
  <div class="grid g4">
    <div class="card kpi"><span class="lbl">Peças no local</span><span class="val">${nf(pecasNaObra(oid))}</span></div>
    <div class="card kpi"><span class="lbl">Guias emitidas</span><span class="val">${S.guias.filter(g => g.obraId === oid).length}</span></div>
    <div class="card kpi"><span class="lbl">Faturas</span><span class="val">${fs.length}</span></div>
    <div class="card kpi"><span class="lbl">Total faturado</span><span class="val">${mt(fs.reduce((s, f) => s + totalFat(f), 0)).replace(' MT', '')}</span><span class="sub">MT</span></div>
  </div>
  <div class="tabs">${[['mapa', 'Mapa de movimentos'], ['inv', 'Inventário actual'], ['fat', 'Faturas da obra']].map(t => `<button class="${tab === t[0] ? 'on' : ''}" onclick="window._to='${t[0]}';render()">${t[1]}</button>`).join('')}</div>
  <div class="card">
    ${tab === 'mapa' ? `<div class="toolbar" style="justify-content:space-between"><span class="muted">Entregas aumentam o saldo; devoluções e perdas reduzem-no.</span><button class="btn sm" onclick="imprimirMapa('${oid}')">Imprimir mapa</button></div><div class="tbl-wrap">${tabelaMapa(oid)}</div>` : ''}
    ${tab === 'inv' ? `<div class="toolbar" style="justify-content:space-between"><span class="muted">Material que ainda está na obra, por lote levantado.</span><button class="btn sm" onclick="imprimirInventario('${oid}')">Imprimir inventário</button></div><div class="tbl-wrap">${tabelaInventario(oid)}</div>` : ''}
    ${tab === 'fat' ? tabelaFaturas(fs, false) : ''}
  </div>`;
}
function novaEntregaObra(oid) { novaEntrega(); M.clienteId = obra(oid).clienteId; M.obraId = oid; redesenhar(); }
function imprimirMapa(oid) {
  const o = obra(oid);
  modal('Mapa de controlo da obra', `<div class="paper">${cabecalho('Mapa de movimentos', o.id, `<div>Emitido em ${dt(hoje())}</div>`)}${blocoCliente(cliente(o.clienteId), o)}${tabelaMapa(oid)}</div>`,
    `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir</button>`, true);
}
function imprimirInventario(oid) {
  const o = obra(oid);
  modal('Inventário da obra', `<div class="paper">${cabecalho('Inventário em obra', o.id, `<div>Em ${dt(hoje())}</div>`)}${blocoCliente(cliente(o.clienteId), o)}${tabelaInventario(oid)}<div class="sigs"><div>O apontador</div><div></div><div>O cliente</div></div></div>`,
    `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir</button>`, true);
}
function novoCliente() {
  M = { tipo: 'cli', c: { tipo: 'Empresa', nome: '', nuit: '', morada: '', alvara: '', contactos: '' } };
  modal('Novo cliente', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarCliente()">Gravar</button>`);
  redesenhar();
}
function corpoCliente() {
  const c = M.c;
  return `<div class="seg"><button class="${c.tipo === 'Particular' ? 'on' : ''}" onclick="M.c.tipo='Particular';redesenhar()">Particular</button><button class="${c.tipo === 'Empresa' ? 'on' : ''}" onclick="M.c.tipo='Empresa';redesenhar()">Empresa</button></div>
  <div class="form"><div class="field full"><label for="nN">Nome</label><input id="nN" value="${esc(c.nome)}" oninput="M.c.nome=this.value"></div>
  ${c.tipo === 'Empresa' ? `<div class="field"><label for="nU">NUIT</label><input id="nU" value="${esc(c.nuit)}" oninput="M.c.nuit=this.value" maxlength="9"></div><div class="field"><label for="nA">Alvará</label><input id="nA" value="${esc(c.alvara)}" oninput="M.c.alvara=this.value"></div>` : ''}
  <div class="field full"><label for="nM">Morada</label><input id="nM" value="${esc(c.morada)}" oninput="M.c.morada=this.value"></div>
  <div class="field full"><label for="nC">Contactos</label><input id="nC" value="${esc(c.contactos)}" oninput="M.c.contactos=this.value"></div></div>`;
}
function gravarCliente() {
  if (!M.c.nome.trim()) return toast('Indique o nome.');
  if (M.c.tipo === 'Empresa' && !/^\d{9}$/.test(M.c.nuit)) return toast('O NUIT deve ter 9 dígitos.');
  criarCliente(M.c); fecharModal(); salvarERender(); toast('Cliente registado.');
}
function novaObra(cid) {
  M = { tipo: 'ob', cid, nome: '', local: '' };
  modal(`Nova obra — ${cliente(cid).nome}`, '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarObra()">Gravar</button>`);
  redesenhar();
}
function corpoObra() {
  return `<div class="form"><div class="field"><label for="obN">Nome da obra</label><input id="obN" value="${esc(M.nome)}" oninput="M.nome=this.value"></div>
  <div class="field"><label for="obL">Local / centro de custo</label><input id="obL" value="${esc(M.local)}" oninput="M.local=this.value" placeholder="Província — cidade"></div></div>`;
}
function gravarObra() {
  if (!M.nome.trim() || !M.local.trim()) return toast('Indique nome e local da obra.');
  criarObra(M.cid, M.nome, M.local); fecharModal(); salvarERender(); toast('Obra criada.');
}

/* ---------- Faturas (RF19–RF25) ---------- */
function tabelaFaturas(fs, comCliente = true) {
  const tot = fs.reduce((s, f) => s + totalFat(f), 0);
  return `<div class="tbl-wrap"><table><thead><tr><th>N.º</th><th>Data</th>${comCliente ? '<th>Cliente</th>' : ''}<th>Obra</th><th>Tipo</th><th>Guia</th><th class="n">Valor</th><th></th></tr></thead><tbody>
  ${fs.map(f => { const o = obra(f.obraId); return `<tr><td class="code">${f.num}</td><td>${dt(f.data)}</td>${comCliente ? `<td>${esc(nomeCliente(o.clienteId))}</td>` : ''}<td>${esc(o.nome)}</td><td>${pill(f.tipo)}</td><td class="code">${f.guia}</td><td class="n">${mt(totalFat(f))}</td><td style="text-align:right"><button class="btn sm" onclick="verFatura('${f.num}')">Ver</button></td></tr>`; }).join('') || `<tr><td colspan="8" class="empty">Sem faturas no filtro escolhido.</td></tr>`}
  </tbody>${fs.length ? `<tfoot><tr><td colspan="${comCliente ? 6 : 5}">Total (${fs.length} faturas)</td><td class="n">${mt(tot)}</td><td></td></tr></tfoot>` : ''}</table></div>`;
}
function vFaturas() {
  const F = window._ff || (window._ff = {});
  let fs = [...S.faturas].sort((a, b) => b.data.localeCompare(a.data) || b.num.localeCompare(a.num));
  if (F.cli) fs = fs.filter(f => obra(f.obraId).clienteId === F.cli);
  if (F.obra) fs = fs.filter(f => f.obraId === F.obra);
  if (F.de) fs = fs.filter(f => f.data >= F.de);
  if (F.ate) fs = fs.filter(f => f.data <= F.ate);
  const sim = window._sim || (window._sim = { lev: '2026-11-01', dev: '2026-11-05', qtd: 10, cod: 'PR-200' });
  const dSim = diasCobrados(sim.lev, sim.dev);
  return `<div class="head"><div><h1>Faturas</h1><p>Uma fatura por obra e por movimento. Sem IVA nem outros impostos.</p></div></div>
  <div class="card"><div class="toolbar">
    <select id="fCli" aria-label="Cliente" onchange="window._ff.cli=this.value;window._ff.obra='';render()"><option value="">Todos os clientes</option>${S.clientes.map(c => `<option value="${c.id}" ${F.cli === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <select id="fObra" aria-label="Obra" onchange="window._ff.obra=this.value;render()" ${F.cli ? '' : 'disabled'}><option value="">Todas as obras</option>${F.cli ? obrasDe(F.cli).map(o => `<option value="${o.id}" ${F.obra === o.id ? 'selected' : ''}>${esc(o.nome)}</option>`).join('') : ''}</select>
    <label class="muted" for="fDe">De</label><input id="fDe" type="date" value="${F.de || ''}" onchange="window._ff.de=this.value;render()" style="width:auto">
    <label class="muted" for="fAte">até</label><input id="fAte" type="date" value="${F.ate || ''}" onchange="window._ff.ate=this.value;render()" style="width:auto">
    <button class="btn sm ghost" onclick="window._ff={};render()">Limpar filtros</button>
  </div>${tabelaFaturas(fs)}</div>
  <div class="card"><h3>Simulador da regra de dias (RF19–RF21)</h3>
    <div class="toolbar">
      <select id="sCod" aria-label="Artigo" onchange="window._sim.cod=this.value;render()" style="width:auto">${optArtigos(sim.cod)}</select>
      <label class="muted" for="sQ">Qtd</label><input id="sQ" type="number" min="1" value="${sim.qtd}" onchange="window._sim.qtd=+this.value;render()" style="width:80px">
      <label class="muted" for="sL">Levantado</label><input id="sL" type="date" value="${sim.lev}" onchange="window._sim.lev=this.value;render()" style="width:auto">
      <label class="muted" for="sD">Devolvido</label><input id="sD" type="date" value="${sim.dev}" onchange="window._sim.dev=this.value;render()" style="width:auto">
    </div>
    <div>Levantado a ${dt(sim.lev)} e devolvido a ${dt(sim.dev)}: <b>${dSim} dias cobrados</b> (não contam o dia de levantamento nem o de devolução).<br>
    ${nf(sim.qtd)} × ${dSim} dias × ${mt(artigo(sim.cod).preco)} = <b>${mt(sim.qtd * dSim * artigo(sim.cod).preco)}</b></div>
  </div>`;
}

/* ---------- Relatórios (RF28, RF29) ---------- */
function vRelatorios() {
  const h = hoje();
  const R = window._rel || (window._rel = { de: h.slice(0, 8) + '01', ate: h, modo: 'periodo' });
  const fs = S.faturas.filter(f => f.data >= R.de && f.data <= R.ate);
  const porCli = {};
  fs.forEach(f => { const o = obra(f.obraId); const k = o.clienteId; porCli[k] = porCli[k] || { n: 0, v: 0, obras: {} }; porCli[k].n++; porCli[k].v += totalFat(f); porCli[k].obras[o.id] = (porCli[k].obras[o.id] || 0) + totalFat(f); });
  const tot = fs.reduce((s, f) => s + totalFat(f), 0);
  const max = Math.max(1, ...Object.values(porCli).map(x => x.v));
  const meses = {};
  S.faturas.forEach(f => { const m = f.data.slice(0, 7); meses[m] = (meses[m] || 0) + totalFat(f); });
  const ms = Object.keys(meses).sort();
  const mMax = Math.max(1, ...Object.values(meses));
  return `<div class="head"><div><h1>Relatórios de faturação</h1><p>Por período, por cliente e por obra.</p></div>
    <div class="actions"><button class="btn" onclick="imprimirRelatorio()">Imprimir relatório</button></div></div>
  <div class="card"><div class="toolbar">
    <label class="muted" for="rDe">Período de</label><input id="rDe" type="date" value="${R.de}" onchange="window._rel.de=this.value;render()" style="width:auto">
    <label class="muted" for="rAte">até</label><input id="rAte" type="date" value="${R.ate}" onchange="window._rel.ate=this.value;render()" style="width:auto">
    ${ms.map(m => `<button class="btn sm" onclick="relMes('${m}')">${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][+m.slice(5) - 1]} ${m.slice(0, 4)}</button>`).join('')}
  </div></div>
  <div class="grid g2">
    <div class="card"><h3>Clientes faturados no período</h3>
      <div class="tbl-wrap" id="relTabela">${tabelaRelatorio(porCli, tot)}</div>
    </div>
    <div class="card"><h3>Faturação por mês (MT)</h3>
      ${ms.map(m => `<div class="stock-row"><span>${dt(m + '-01').slice(3)}</span><div class="bar" style="height:14px"><span style="width:${meses[m] / mMax * 100}%"></span></div><span class="num">${nf(Math.round(meses[m]))}</span></div>`).join('')}
      <h3 style="margin-top:8px">Peso de cada cliente no período</h3>
      ${Object.entries(porCli).map(([k, x]) => `<div class="stock-row"><span>${esc(nomeCliente(k))}</span><div class="bar" style="height:14px"><span style="width:${x.v / max * 100}%"></span></div><span class="num">${Math.round(x.v / (tot || 1) * 100)}%</span></div>`).join('') || '<div class="empty">Sem faturas no período.</div>'}
    </div>
  </div>`;
}
function tabelaRelatorio(porCli, tot) {
  return `<table><thead><tr><th>Cliente / obra</th><th class="n">Faturas</th><th class="n">Valor</th></tr></thead><tbody>
  ${Object.entries(porCli).map(([k, x]) => `<tr><td><b>${esc(nomeCliente(k))}</b></td><td class="n">${x.n}</td><td class="n"><b>${mt(x.v)}</b></td></tr>` +
    Object.entries(x.obras).map(([oid, v]) => `<tr><td style="padding-left:24px" class="muted">${esc(obra(oid).nome)}</td><td></td><td class="n muted">${mt(v)}</td></tr>`).join('')).join('') || '<tr><td colspan="3" class="empty">Sem faturas no período.</td></tr>'}
  </tbody><tfoot><tr><td>Total do período</td><td class="n">${Object.values(porCli).reduce((s, x) => s + x.n, 0)}</td><td class="n">${mt(tot)}</td></tr></tfoot></table>`;
}
function relMes(m) {
  const [y, mm] = m.split('-').map(Number);
  const ult = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  window._rel.de = m + '-01'; window._rel.ate = `${m}-${pad(ult, 2)}`; render();
}
function imprimirRelatorio() {
  const R = window._rel;
  modal('Relatório de faturação', `<div class="paper">${cabecalho('Relatório de faturação', `${dt(R.de)} a ${dt(R.ate)}`)}${$('#relTabela').innerHTML}<div style="color:#555">Valores sem IVA.</div></div>`,
    `<button class="btn" onclick="fecharModal()">Fechar</button><button class="btn pri" onclick="imprimir()">Imprimir</button>`, true);
}

/* ---------- Inventário de artigos (RF01–RF04) ---------- */
function vArtigos() {
  const cat = window._cat || 'Todas';
  const cats = [...new Set(S.artigos.map(a => a.cat))];
  const as = S.artigos.filter(a => cat === 'Todas' || a.cat === cat);
  return `<div class="head"><div><h1>Inventário de artigos</h1><p>Cada medida é um artigo próprio, com código, preço diário e quantidades.</p></div>
    <div class="actions">${pode('artigo') ? `<button class="btn pri" onclick="editarArtigo()">Novo artigo</button>` : ''}</div></div>
  <div class="seg">${['Todas', ...cats].map(c => `<button class="${cat === c ? 'on' : ''}" onclick="window._cat='${c}';render()">${c}</button>`).join('')}</div>
  <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Categoria</th><th>Medida</th><th>Descrição</th><th class="n">Preço/dia</th><th class="n">Total</th><th class="n">Em armazém</th><th class="n">Alugada</th><th></th></tr></thead><tbody>
  ${as.map(a => { const al = alugado(a.cod), arm = a.total - al; return `<tr><td class="code">${a.cod}</td><td>${esc(a.cat)}</td><td>${esc(a.medida)}</td><td>${esc(a.desc)}</td><td class="n">${mt(a.preco)}</td><td class="n">${nf(a.total)}</td><td class="n">${nf(arm)} ${arm < a.total * 0.2 ? '<span class="pill p-bad">baixo</span>' : ''}</td><td class="n">${nf(al)}</td><td>${pode('artigo') ? `<button class="btn sm" onclick="editarArtigo('${a.cod}')">Editar</button>` : ''}</td></tr>`; }).join('')}
  </tbody><tfoot><tr><td colspan="5">Totais</td><td class="n">${nf(as.reduce((s, a) => s + a.total, 0))}</td><td class="n">${nf(as.reduce((s, a) => s + emArmazem(a.cod), 0))}</td><td class="n">${nf(as.reduce((s, a) => s + alugado(a.cod), 0))}</td><td></td></tr></tfoot></table></div></div>`;
}
function editarArtigo(cod) {
  const a = cod ? artigo(cod) : null;
  M = { tipo: 'art', orig: cod || null, a: a ? { ...a } : { cod: '', cat: 'Prumo', medida: '', desc: '', total: 0, preco: 0 } };
  modal(a ? `Editar ${cod}` : 'Novo artigo', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarArtigo()">Gravar</button>`);
  redesenhar();
}
function corpoArtigo() {
  const a = M.a, cats = [...new Set(S.artigos.map(x => x.cat))];
  return `<div class="form">
    <div class="field"><label for="aC">Código</label><input id="aC" value="${esc(a.cod)}" oninput="M.a.cod=this.value.toUpperCase()" ${M.orig ? 'disabled' : ''} placeholder="Ex.: PR-300"></div>
    <div class="field"><label for="aK">Categoria</label><input id="aK" list="cats" value="${esc(a.cat)}" oninput="M.a.cat=this.value"><datalist id="cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label for="aMd">Medida</label><input id="aMd" value="${esc(a.medida)}" oninput="M.a.medida=this.value" placeholder="Ex.: 3,00 m"></div>
    <div class="field"><label for="aP">Preço de aluguer diário (MT)</label><input id="aP" type="number" min="0" step="0.5" value="${a.preco}" oninput="M.a.preco=+this.value"></div>
    <div class="field full"><label for="aD">Descrição</label><input id="aD" value="${esc(a.desc)}" oninput="M.a.desc=this.value"></div>
    <div class="field"><label for="aT">Quantidade total</label><input id="aT" type="number" min="0" value="${a.total}" oninput="M.a.total=+this.value"></div>
    ${M.orig ? `<div class="field"><label>Alugada neste momento</label><input value="${alugado(M.orig)}" disabled></div>` : ''}
  </div>${M.orig ? '<div class="note">Alterar o preço afecta só as novas guias. Os lotes já levantados mantêm o preço do dia em que saíram.</div>' : ''}`;
}
function gravarArtigo() {
  const a = M.a;
  if (!a.cod || !a.desc || !a.cat) return toast('Preencha código, categoria e descrição.');
  if (M.orig) {
    if (a.total < alugado(M.orig)) return toast(`O total não pode ser inferior às ${alugado(M.orig)} peças alugadas.`);
    Object.assign(artigo(M.orig), a);
  } else {
    if (artigo(a.cod)) return toast('Já existe um artigo com esse código.');
    S.artigos.push(a);
  }
  fecharModal(); salvarERender(); toast('Artigo gravado.');
}

/* ---------- Configurações ---------- */
function vConfig() {
  const e = S.empresa;
  return `<div class="head"><div><h1>Configurações</h1><p>Dados da empresa que aparecem nas guias e faturas.</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>Dados da empresa</h3><div class="form">
      <div class="field full"><label for="eN">Nome</label><input id="eN" value="${esc(e.nome)}" onchange="S.empresa.nome=this.value;salvarERender()"></div>
      <div class="field"><label for="eU">NUIT</label><input id="eU" value="${esc(e.nuit)}" onchange="S.empresa.nuit=this.value;guardar()"></div>
      <div class="field"><label for="eP">Dias previstos por omissão</label><input id="eP" type="number" min="1" value="${S.diasPrevPadrao}" onchange="S.diasPrevPadrao=+this.value;guardar()"></div>
      <div class="field full"><label for="eM">Morada</label><input id="eM" value="${esc(e.morada)}" onchange="S.empresa.morada=this.value;guardar()"></div>
      <div class="field full"><label for="eC">Contactos</label><input id="eC" value="${esc(e.contactos)}" onchange="S.empresa.contactos=this.value;guardar()"></div>
    </div></div>
    <div class="card"><h3>Regra de faturação (ponto 6.1 por confirmar)</h3>
      <p style="margin:0">Este protótipo usa a <b>Opção A — período estimado com acerto</b>: fatura-se no levantamento pelos dias previstos e, na devolução, emite-se uma fatura de acerto (positiva se ficou mais tempo, negativa se devolveu antes).</p>
      <p style="margin:0" class="muted">A Opção B (faturação periódica de 30 em 30 dias) pode ser activada depois de o cliente confirmar.</p>
      <h3>Dados de demonstração</h3>
      <p style="margin:0" class="muted">Tudo o que for criado fica gravado neste navegador.</p>
      <div><button class="btn danger" onclick="repor()">Repor dados de exemplo</button></div>
    </div>
  </div>
  <div class="card"><div class="head"><div><h3>Utilizadores e perfis (ponto 6.2)</h3><p>Administrador: acesso total. Apontador: guias de entrega e devoluções. Faturação: cotações, faturas e relatórios.</p></div>
    <div class="actions"><button class="btn pri" onclick="novoUtilizador()">Novo utilizador</button></div></div>
    <div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>Utilizador</th><th>Perfil</th><th>Estado</th><th></th></tr></thead><tbody>
    ${S.utilizadores.map((u, i) => `<tr><td>${esc(u.nome)}</td><td class="code">${esc(u.user)}</td><td>${esc(NOME_PERFIL[u.perfil])}</td><td>${u.activo ? pill('Activo') : '<span class="pill p-mute">Inactivo</span>'}</td>
      <td style="text-align:right">${u.user === S.sessao ? '<span class="muted">sessão actual</span>' : `<button class="btn sm" onclick="S.utilizadores[${i}].activo=!S.utilizadores[${i}].activo;salvarERender()">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('')}
    </tbody></table></div></div>`;
}
function novoUtilizador() {
  M = { tipo: 'usr', u: { nome: '', user: '', pass: '', perfil: 'apontador', activo: true } };
  modal('Novo utilizador', '', `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="gravarUtilizador()">Criar utilizador</button>`);
  redesenhar();
}
function corpoUtilizador() {
  const u = M.u;
  return `<div class="form">
    <div class="field full"><label for="uN">Nome completo</label><input id="uN" value="${esc(u.nome)}" oninput="M.u.nome=this.value"></div>
    <div class="field"><label for="uU">Utilizador</label><input id="uU" value="${esc(u.user)}" oninput="M.u.user=this.value.trim().toLowerCase()" autocapitalize="none"></div>
    <div class="field"><label for="uP">Palavra-passe</label><input id="uP" value="${esc(u.pass)}" oninput="M.u.pass=this.value"></div>
    <div class="field full"><label for="uPf">Perfil</label><select id="uPf" onchange="M.u.perfil=this.value">${Object.entries(NOME_PERFIL).map(([k, v]) => `<option value="${k}" ${u.perfil === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  </div>`;
}
function gravarUtilizador() {
  const u = M.u;
  if (!u.nome.trim() || !u.user) return toast('Indique o nome e o utilizador.');
  if (u.pass.length < 6) return toast('A palavra-passe deve ter pelo menos 6 caracteres.');
  if (S.utilizadores.some(x => x.user === u.user)) return toast('Já existe um utilizador com esse nome.');
  S.utilizadores.push(u); fecharModal(); salvarERender(); toast(`Utilizador ${u.user} criado.`);
}
function repor() {
  modal('Repor dados de exemplo', '<p style="margin:0">Apaga tudo o que foi criado durante a demonstração e volta aos dados iniciais.</p>',
    `<button class="btn" onclick="fecharModal()">Cancelar</button><button class="btn pri" onclick="const s=S.sessao;S=dadosExemplo();S.sessao=s;guardar();fecharModal();render();toast('Dados repostos.')">Repor</button>`);
}

/* ---------------- Arranque ---------------- */
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalRoot').innerHTML) fecharModal(); });
$('#loginForm').addEventListener('submit', entrar);
$('#logout').addEventListener('click', sair);
window.addEventListener('hashchange', () => { if (!rota().startsWith('obra-')) window._to = 'mapa'; render(); });
carregar();
render();
