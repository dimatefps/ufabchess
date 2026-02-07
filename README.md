# UFABChess Frontend

Frontend da **UFABChess**, projeto de organização, divulgação e gerenciamento de torneios de xadrez da UFABC.

Este repositório contém apenas o **frontend estático**, construído com HTML, CSS e JavaScript puro, integrado ao **Supabase** para autenticação, banco de dados e regras de negócio.

---

## Visão geral

O site da UFABChess permite:

* Visualizar torneios em andamento e finalizados
* Acompanhar classificações e standings em tempo real
* Consultar ratings dos jogadores
* Acessar páginas informativas sobre regras, torneios e sistema de rating
* Área administrativa para gerenciamento de torneios e partidas

---

## Tecnologias utilizadas

* HTML5
* CSS3
* JavaScript (ES Modules)
* Supabase (Auth, Database, RPC)
* Git e GitHub

Não há framework frontend. A ideia é manter o projeto simples, leve e fácil de manter.

---

## Estrutura de pastas

```
docs/
├── admin/                # Páginas e scripts administrativos
├── auth/                 # Fluxos de autenticação
├── components/           # Header, footer e componentes reutilizáveis
├── pages/                # Páginas públicas do site
├── scripts/
│   ├── pages/            # Scripts específicos de páginas
│   ├── services/         # Serviços de acesso ao Supabase
│   └── shared/           # Lógica compartilhada (layout, auth, etc)
├── styles/               # Estilos globais e por página
└── assets/               # Imagens e ícones
```

---

## Integração com Supabase

O frontend se conecta ao Supabase para:

* Autenticação de usuários
* Leitura de dados de torneios, jogadores e standings
* Execução de funções SQL (RPC) para lógica complexa
* Controle de acesso via RLS

As credenciais públicas do Supabase ficam configuradas em:

```
docs/scripts/services/supabase.js
```

---

## Como rodar localmente

### 1. Clonar o repositório

```bash
git clone https://github.com/dimatefps/ufabchess-frontend.git
cd ufabchess-frontend
```

### 2. Servir os arquivos localmente

Como o projeto usa ES Modules, **não abra o HTML direto pelo navegador**. Use um servidor local.

Exemplos:

Com Python:

```bash
python -m http.server 8000
```

Com Node:

```bash
npx serve docs
```

Depois, acesse:

```
http://localhost:8000
```

---

## Autenticação e área admin

* Usuários administrativos fazem login pela página de admin
* A autenticação é feita via Supabase Auth
* O controle de permissões é aplicado principalmente no backend (RLS e funções)

---

## Status do projeto

Projeto em desenvolvimento contínuo, utilizado ativamente na organização dos torneios do UFABChess.

Mudanças frequentes podem ocorrer, especialmente na área administrativa.

---

## Licença

Este projeto é de uso interno do UFABChess.
Distribuição, cópia ou reutilização devem ser discutidas com os organizadores.