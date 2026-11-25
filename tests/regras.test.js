// Testes das regras de negócio do protótipo (RF02–RF27).
// Correm sem navegador: o app.js é carregado com um DOM simulado.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function elementoFalso() {
  return new Proxy({}, {
    get(alvo, prop) {
      if (prop in alvo) return alvo[prop];
      if (prop === 'classList') return { add() {}, remove() {}, contains: () => false };
      if (prop === 'style' || prop === 'dataset') return {};
      if (prop === 'selectedOptions') return [{ text: '' }];
      return typeof prop === 'string' && /^[a-z]/.test(prop) && !['innerHTML', 'textContent', 'value', 'hidden'].includes(prop) ? () => {} : '';
    },
    set(alvo, prop, valor) { alvo[prop] = valor; return true; }
  });
}

function carregarApp() {
  const memoria = {};
  const contexto = {
    console, setTimeout, clearTimeout,
    document: {
      querySelector: () => elementoFalso(),
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => elementoFalso(),
      body: elementoFalso()
    },
    window: { addEventListener() {} },
    location: { hash: '', pathname: '/' },
    history: { replaceState() {} },
    localStorage: {
      getItem: k => (k in memoria ? memoria[k] : null),
      setItem: (k, v) => { memoria[k] = String(v); }
    }
  };
  vm.createContext(contexto);
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInContext(codigo + `
    ;this.__api = {
      estado: () => S, entrarComo: u => { S.sessao = u; S.perfil = S.utilizadores.find(x => x.user === u).perfil; },
      diasEntre, diasCobrados, dadosExemplo, emitirEntrega, registarDevolucao, criarCotacao,
      saldoObra, alugado, emArmazem, totalFat, totalCot, passosTutorial, artigo
    };`, contexto, { filename: 'app.js' });
  return contexto.__api;
}

const app = carregarApp();
beforeEach(() => { app.dadosExemplo(); });

test('RF20 — não conta o dia de levantamento nem o de devolução', () => {
  assert.equal(app.diasCobrados('2026-11-01', '2026-11-05'), 3);
  assert.equal(app.diasCobrados('2026-11-01', '2026-11-02'), 0);
  assert.equal(app.diasCobrados('2026-11-01', '2026-11-01'), 0);
  assert.equal(app.diasCobrados('2026-01-30', '2026-03-02'), 30); // atravessa Fevereiro
});

test('Dados de exemplo são coerentes', () => {
  const S = app.estado();
  assert.equal(S.clientes.length, 2);
  assert.equal(S.obras.length, 4);
  assert.equal(S.faturas.length, 8);
  // Devolução antecipada no Edifício Sommerschield: −7 dias × (40×18 + 20×12) + 1200 de danos
  assert.equal(app.totalFat(S.faturas.find(f => f.num === 'FT-0003')), -5520);
  assert.deepEqual({ ...app.saldoObra('OB-0004') }, {});
});

test('RF03 — quantidades total, em armazém e alugada batem certo', () => {
  for (const a of app.estado().artigos) {
    assert.equal(app.emArmazem(a.cod) + app.alugado(a.cod), a.total, a.cod);
    assert.ok(app.emArmazem(a.cod) >= 0, a.cod);
  }
});

test('RF12 — a guia de entrega exige obra de destino', () => {
  assert.throws(() => app.emitirEntrega({ obraId: '', data: '2026-12-01', diasPrev: 10, linhas: [{ cod: 'PR-200', qtd: 1 }] }), /obra/);
});

test('Não deixa sair mais material do que há em armazém', () => {
  const livre = app.emArmazem('PR-200');
  assert.throws(() => app.emitirEntrega({ obraId: 'OB-0004', data: '2026-12-01', diasPrev: 10, linhas: [{ cod: 'PR-200', qtd: livre + 1 }] }), /Stock insuficiente/);
});

test('RF21/RF22 — fatura no levantamento: quantidade × dias previstos × preço diário', () => {
  const antes = app.emArmazem('PR-200');
  const { g, f } = app.emitirEntrega({ obraId: 'OB-0004', data: '2026-12-01', diasPrev: 10, linhas: [{ cod: 'PR-200', qtd: 20 }] });
  assert.equal(g.tipo, 'Entrega');
  assert.equal(f.obraId, 'OB-0004');
  assert.equal(app.totalFat(f), 20 * 10 * 15);
  assert.equal(app.emArmazem('PR-200'), antes - 20);
  assert.equal(app.saldoObra('OB-0004')['PR-200'], 20);
});

test('RF13/RF16 — a devolução reduz o saldo e faz o acerto pelos dias reais', () => {
  app.emitirEntrega({ obraId: 'OB-0004', data: '2026-12-01', diasPrev: 10, linhas: [{ cod: 'PR-200', qtd: 10 }] });
  // 01/12 → 15/12 = 13 dias reais; faturados 10 → acerto de +3 dias
  const { f } = app.registarDevolucao({ obraId: 'OB-0004', data: '2026-12-15', linhas: [{ cod: 'PR-200', qtd: 10 }] });
  assert.equal(app.totalFat(f), 10 * 3 * 15);
  assert.equal(app.saldoObra('OB-0004')['PR-200'], undefined);
});

test('RF21 — cada lote levantado é calculado em separado (mais antigo primeiro)', () => {
  app.emitirEntrega({ obraId: 'OB-0004', data: '2026-12-01', diasPrev: 5, linhas: [{ cod: 'TR-100', qtd: 10 }] });
  app.emitirEntrega({ obraId: 'OB-0004', data: '2026-12-05', diasPrev: 5, linhas: [{ cod: 'TR-100', qtd: 10 }] });
  // devolve 15 a 12/12: 10 do lote de 01/12 (10 dias reais, +5) e 5 do lote de 05/12 (6 dias reais, +1)
  const { f } = app.registarDevolucao({ obraId: 'OB-0004', data: '2026-12-12', linhas: [{ cod: 'TR-100', qtd: 15 }] });
  assert.equal(app.totalFat(f), 10 * 5 * 8 + 5 * 1 * 8);
  assert.equal(app.saldoObra('OB-0004')['TR-100'], 5);
});

test('Não aceita devolver mais do que a obra tem', () => {
  assert.throws(() => app.registarDevolucao({ obraId: 'OB-0001', data: '2026-12-01', linhas: [{ cod: 'CH-150', qtd: 61 }] }), /só tem 60/);
});

test('RF26/RF27 — perdas saem do inventário e danos são faturados pelo valor acordado', () => {
  const total = app.artigo('CH-150').total;
  const { f } = app.registarDevolucao({ obraId: 'OB-0001', data: '2026-11-30', linhas: [{ cod: 'CH-150', qtd: 55, danif: 3, perd: 5 }], danos: 2500 });
  assert.equal(app.artigo('CH-150').total, total - 5);
  assert.equal(app.saldoObra('OB-0001')['CH-150'], undefined);
  assert.ok(f.linhas.some(l => l.valor === 2500 && /Danos/.test(l.desc)));
});

test('RF09/RF23 — cada obra tem faturas independentes', () => {
  const S = app.estado();
  const obrasCliente1 = S.obras.filter(o => o.clienteId === 'CL-0001').map(o => o.id);
  const comFatura = new Set(S.faturas.map(f => f.obraId).filter(id => obrasCliente1.includes(id)));
  assert.equal(comFatura.size, 3);
});

test('RF05 — a cotação não cria cliente', () => {
  const S = app.estado();
  const n = S.clientes.length;
  const c = app.criarCotacao({ nome: 'Teste Lda', local: 'Maputo', dias: 10, data: '2026-12-01', linhas: [{ cod: 'PR-200', qtd: 10 }] });
  assert.equal(c.estado, 'Pendente');
  assert.equal(S.clientes.length, n);
  assert.equal(app.totalCot(c), 10 * 15 * 10);
});

test('Tutorial mostra só as telas permitidas a cada perfil', () => {
  app.entrarComo('apontador');
  const titulos = app.passosTutorial().map(p => p.titulo);
  assert.ok(titulos.includes('Guias de entrega e devolução'));
  assert.ok(!titulos.includes('Faturas'));
  assert.ok(!titulos.includes('Configurações'));
  app.entrarComo('admin');
  assert.equal(app.passosTutorial().length, 12);
});
