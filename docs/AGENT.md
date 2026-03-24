# Manifesto de Engenharia de Front-End de Elite
**Padrões Arquiteturais, Segurança e Performance (v1.0)**

Este documento consolida uma alma técnica resiliente e performática. Use-o como bússola para novos projetos que exigem performance industrial e segurança blindada sem a dependência de frameworks pesados.

---

## 🧠 1. Filosofia de Design: O Dual-Persona
Projetos de elite servem a dois mestres sem comprometer a alma técnica:
*   **Marcus Thorne (O Engenheiro):** Busca performance bruta, controle de baixo nível e estética industrial (Deep Slate/Emerald). Valoriza transparência no processamento e zero-bloat.
*   **Laura Santos (A Criadora):** Busca simplicidade, feedback visual claro e acessibilidade (Ícones, Toasts, Temas intuitivos).

**Princípio:** *Progressive Disclosure*. Mantenha a interface limpa para os usuários comuns, mas deixe o motor exposto para os técnicos.

---

## 🏗️ 2. Arquitetura de Performance (Zero-RAM Engine)
Esta arquitetura resolve o gargalo de processamento massivo no browser:
*   **Vanilla JS + Vite:** Mantenha o bundle pequeno (ex: <50KB).
*   **Worker Pool Dinâmico:** Use `navigator.hardwareConcurrency` para distribuir o processamento sem travar a Main Thread.
*   **IndexedDB Wrapper:** Jamais guarde Blobs pesados na RAM. Envie do Worker direto para o disco persistente (`IndexedDB`) e limpe a referência da memória ativa imediatamente.
*   **Streaming de Arquivos:** Gere saídas pesadas (ZIP/PDF/Video) em chunks (lotes) lendo do IndexedDB para evitar o erro de Out-of-Memory (OOM).
*   **Yield to Main Thread:** Introduza milissegundos de silêncio (10ms) entre lotes para permitir que o Garbage Collector limpe o Heap.

---

## 🛡️ 3. Segurança (Defense-in-Depth)
Segurança não é um plugin; é uma diretiva:
*   **Strict CSP (Content Security Policy):** Bloqueie tudo por padrão (`default-src 'self'`). Permita apenas domínios de telemetria e assets especificamente mapeados.
*   **Worker Isolation:** Use Workers agnósticos (sem `type: 'module'`) para máxima compatibilidade e menor superfície de ataque em CSPs rigorosas. Sempre adicione `child-src 'self' blob:;` como fallback.
*   **Resource Bomb Protection:** Limite resoluções ou tamanhos de entrada no Worker antes de processar, evitando exaustão de recursos.
*   **Sanitização de Saída:** Ao gerar arquivos, sanitize nomes de originais removendo qualquer path traversal (`../`) injetado.

---

## 🎨 4. UI/UX (Prosumer SaaS Aesthetics)
*   **Design Tokens:** Use variáveis CSS (HMR-proof) para mapas de cores dinâmicos.
*   **FOUC-Proof (Flash of Unstyled Content):** Injete a lógica de tema síncrona no `<head>` antes do DOM pintar.
*   **Tipografia de Alta Precisão:** Use fontes geométricas e industriais com targets de clique robustos (min 44px).
*   **Ícones Consistentes:** Use semântica visual consistente para estados de sistema (ex: Monitor para Modo Sistema).

---

## 🚀 5. Deploy & Infraestrutura (Cloud Agnostic)
*   **SPA Routing:** Configure regras de rewrite para que acessos diretos a rotas não retornem 404.
*   **Vitals & Analytics:** Use injeções via código em vez de scripts automáticos de terceiros para manter o controle total do bundle.
*   **Immutable Caching:** Direcione ativos estáticos para pastas específicas e use headers de cache agressivos para performance instantânea no retorno do usuário.

---

**Mantra:** *"Se não é performático, não é profissional. Se não é seguro, não é Elite."*
