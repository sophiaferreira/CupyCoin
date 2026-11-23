'use strict';

const form = document.getElementById('form-entrar');
const campo = document.getElementById('senha');
const erro = document.getElementById('erro');
const botao = form.querySelector('button');

campo.focus();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erro.textContent = '';
  botao.disabled = true;
  botao.textContent = 'Entrando…';
  try {
    const resp = await fetch('/api/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: campo.value }),
    });
    const dados = await resp.json().catch(() => ({}));
    if (resp.ok) {
      location.replace('/');
      return;
    }
    erro.textContent = dados.erro || 'Não deu para entrar.';
    campo.select();
  } catch {
    erro.textContent = 'Sem conexão. Confira sua internet.';
  } finally {
    botao.disabled = false;
    botao.textContent = 'Entrar';
  }
});
