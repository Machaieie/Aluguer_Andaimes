# Sistema de Gestão de Aluguer de Andaimes e Cofragem — Protótipo

Protótipo navegável para demonstração ao cliente, feito com base no documento
*Levantamento de Requisitos v1.0* (Nov 2026). Feito em HTML, CSS e JavaScript,
sem dependências nem servidor.

**Versão online:** https://machaieie.github.io/Aluguer_Andaimes/

## Utilizadores de demonstração

| Perfil        | Utilizador  | Palavra-passe | Acesso |
|---------------|-------------|---------------|--------|
| Administrador | `admin`     | `admin123`    | Tudo, incluindo artigos, preços e utilizadores |
| Apontador     | `apontador` | `apont123`    | Guias de entrega e devoluções |
| Faturação     | `faturacao` | `fatura123`   | Cotações, faturas e relatórios |

No primeiro login de cada utilizador abre um tutorial que explica cada tela.
Para o rever, use o botão **Tutorial** no menu.

## O que o protótipo cobre

- Inventário de artigos por categoria e medida, com quantidades total, em armazém e alugada (RF01–RF04)
- Cotações registadas só com o nome; o interessado passa a cliente quando a cotação é aprovada (RF05–RF06)
- Clientes particulares e empresas, cada um com várias obras independentes (RF07–RF09)
- Guias de entrega e devolução impressas em duas vias (RF10–RF14)
- Mapa de movimentos e inventário de cada obra (RF15–RF18)
- Faturação por obra, sem IVA, com acerto pelos dias reais na devolução (RF19–RF25)
- Danos e perdas na devolução (RF26–RF27)
- Relatórios por período, cliente e obra (RF28–RF29)

A regra de faturação segue a **Opção A** do ponto 6.1, que ainda está por confirmar com o cliente.

Os dados ficam guardados no navegador (`localStorage`). Para voltar aos dados
iniciais: **Configurações → Repor dados de exemplo**.

## Abrir no computador

Abra o `index.html` no navegador, com duplo clique. Não precisa de instalar nada.

## Testes

Os testes verificam as regras de negócio: contagem de dias, cálculo das faturas,
acerto por lote, saldos, danos e perdas, e as permissões do tutorial.

```bash
npm test
```

É preciso o Node.js 18 ou mais recente. Não há pacotes para instalar.

## Publicação automática (GitHub Actions)

O ficheiro `.github/workflows/deploy.yml` faz o seguinte:

1. Em cada **push** ou **pull request**: verifica a sintaxe do `app.js` e corre os testes.
2. Em cada **push para o ramo `main`**, se os testes passarem: publica o site no GitHub Pages.

Se algum teste falhar, o site não é actualizado.

### Configuração (só uma vez)

No GitHub, abra o repositório e vá a **Settings → Pages → Build and deployment →
Source** e escolha **GitHub Actions**. A partir daí basta fazer commit e push:

```bash
git add .
git commit -m "Mensagem"
git push
```

O andamento aparece no separador **Actions** do repositório. Quando terminar, o
endereço do site aparece no resumo da execução.

## Estrutura

```
index.html                    Estrutura da página e ecrã de login
styles.css                    Aspecto visual (tema claro e escuro, telemóvel, impressão)
app.js                        Dados, regras de negócio, telas e tutorial
tests/regras.test.js          Testes das regras de negócio
.github/workflows/deploy.yml  Testes e publicação automática
```
