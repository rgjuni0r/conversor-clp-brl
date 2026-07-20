# CLP ⬌ BRL · Conversor de viagem

Progressive Web App para converter peso chileno (CLP) e real brasileiro (BRL), organizar gastos, dividir a conta da viagem e compartilhar o resumo final.

O projeto foi desenvolvido em HTML, CSS e JavaScript puro. Não exige framework, etapa de build ou instalação de dependências.

## Sumário

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Regras de conversão](#regras-de-conversão)
- [Fontes de cotação](#fontes-de-cotação)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Execução local](#execução-local)
- [Testes](#testes)
- [Instalação como aplicativo](#instalação-como-aplicativo)
- [Publicação no GitHub Pages](#publicação-no-github-pages)
- [Configuração e manutenção](#configuração-e-manutenção)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Limitações conhecidas](#limitações-conhecidas)
- [Roadmap](#roadmap)
- [Direitos autorais](#direitos-autorais)

## Visão geral

O CLP ⬌ BRL foi projetado como um companheiro de viagem: a aplicação converte valores, registra cada gasto com a taxa utilizada naquele momento, apresenta os totais nas duas moedas e distribui a conta entre até 99 pessoas.

A sessão fica salva no aparelho e continua disponível após fechar ou recarregar o PWA. A última cotação válida e o shell da interface também são preservados para situações sem conexão.

### Objetivos

- Oferecer conversão simples nos dois sentidos.
- Transformar conversões em uma conta organizada e auditável.
- Dividir valores sem perder centavos ou pesos por arredondamento.
- Manter a interface adequada para uso em celulares.
- Trabalhar com uma referência cambial recente e identificável.
- Continuar disponível quando a conexão estiver instável ou ausente.
- Evitar dependências e infraestrutura desnecessárias.

## Funcionalidades

- Conversão de CLP para BRL e de BRL para CLP.
- Máscara monetária durante a digitação:
  - CLP: `8.500`.
  - BRL: `1.234,56`.
- Atualização automática ao abrir ou retornar ao aplicativo.
- Nova consulta a cada hora enquanto a página estiver visível.
- Referência cambial diária CLP/BRL, com data de origem validada.
- Espelho independente de contingência quando o CDN principal não responde.
- Persistência da última cotação válida no navegador.
- Ajuste manual da taxa de conversão.
- Inclusão de conversões em um resumo com descrição opcional.
- Registro da cotação e da origem usada em cada item.
- Soma dos gastos em CLP e BRL usando unidades monetárias inteiras.
- Exclusão individual ou limpeza completa do resumo.
- Confirmações destrutivas personalizadas, sem alertas nativos do navegador.
- Divisão exata entre 1 e 99 pessoas, incluindo o tratamento do resíduo.
- Recibo final com total, quantidade de pessoas e valor individual.
- Compartilhamento nativo pelo celular, com cópia como alternativa.
- Persistência automática da conta no aparelho.
- Cache do shell da aplicação para uso offline.
- Instalação como PWA no iPhone, Android e navegadores compatíveis.
- Layout responsivo com suporte às áreas seguras do iPhone.
- Identidade visual inspirada na Cordilheira dos Andes, com neve animada em profundidade e movimento acessível.
- Resumo em accordion na versão mobile, preservando a visualização completa no desktop.

## Arquitetura

A aplicação utiliza uma arquitetura client-side estática. Toda a interface, conversão, persistência e comunicação com as APIs são executadas diretamente no navegador.

```mermaid
flowchart TD
    U[Usuário] --> UI[Interface HTML e CSS]
    UI --> APP[Orquestração em app.js]
    APP --> MONEY[js/money.js<br/>máscaras, inteiros e divisão]
    APP --> SESSION[js/session-store.js<br/>sessão versionada]
    APP --> RATES[js/rates.js<br/>fontes e fallback]
    RATES --> PRIMARY[jsDelivr<br/>referência diária CC0]
    PRIMARY -->|sucesso| STORE[localStorage]
    PRIMARY -->|falha| FALLBACK[Cloudflare Pages<br/>espelho da mesma base]
    FALLBACK -->|sucesso| STORE
    SESSION <--> STORE
    STORE --> MONEY
    APP --> SW[Service Worker]
    SW --> CACHE[Cache Storage<br/>arquivos da aplicação]
```

### Componentes

| Componente | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura semântica, campos, controles, metadados do PWA e rodapé. |
| `style.css` | Design responsivo, tema, máscaras visuais e safe areas. |
| `app.js` | Orquestração da interface, eventos, recibo e compartilhamento. |
| `js/money.js` | Máscaras, formatação, conversões e divisão em unidades inteiras. |
| `js/rates.js` | Consulta cambial, timeout, validação da resposta e espelho de contingência. |
| `js/session-store.js` | Modelo versionado, validação e persistência da conta. |
| `sw.js` | Cache dos arquivos locais e funcionamento offline do shell. |
| `manifest.json` | Nome, ícones, cores e comportamento de instalação do PWA. |
| `tests/` | Testes automatizados de moeda, sessão, divisão e fontes cambiais. |
| `localStorage` | Última taxa válida e sessão atual da conta. |

### Estratégia de resiliência

1. A aplicação solicita a referência diária CLP/BRL no CDN principal.
2. A resposta só é aceita quando contém uma data ISO válida e uma taxa positiva.
3. Se o CDN principal falhar, consulta o espelho oficial da mesma base.
4. Se as duas consultas falharem, mantém a última taxa salva no dispositivo.
5. Se não existir uma taxa salva, utiliza apenas a referência inicial incorporada ao aplicativo e informa que não foi possível atualizar.

O timeout de cada consulta é de 10 segundos. O app consulta ao abrir, ao voltar para a tela, ao recuperar a conexão e a cada hora enquanto estiver visível. Tentativas automáticas muito próximas são bloqueadas para evitar requisições duplicadas.

Cada item adicionado congela sua taxa, origem e horário de referência. Atualizações cambiais posteriores afetam apenas novas conversões e nunca alteram silenciosamente os valores que já fazem parte do resumo.

## Regras de conversão

A variável central da aplicação representa quantos reais valem `1 CLP`.

### Peso chileno para real

```text
valor em BRL = valor em CLP × taxa CLP/BRL
```

Exemplo com taxa hipotética de `0,0055`:

```text
8.500 CLP × 0,0055 = 46,75 BRL
```

### Real para peso chileno

```text
valor em CLP = valor em BRL ÷ taxa CLP/BRL
```

Exemplo com a mesma taxa hipotética:

```text
100 BRL ÷ 0,0055 = 18.181,81 CLP
```

O resultado em BRL é armazenado em centavos inteiros e o resultado em CLP em pesos inteiros. A conversão usa frações decimais com `BigInt` e arredonda uma única vez para a menor unidade exibida; totais e divisões somam esses inteiros, evitando erros acumulados de ponto flutuante inclusive em valores exatamente no meio de um centavo.

A taxa é normalizada e exibida com até dez casas decimais. O mesmo valor mostrado na interface é usado no cálculo e gravado em cada item, evitando divergência entre apresentação e conversão.

Quando o total não é divisível igualmente, o app informa quantas pessoas absorvem a unidade restante. Exemplo: `R$ 100,00 ÷ 3` resulta em uma pessoa pagando `R$ 33,34` e duas pagando `R$ 33,33`.

## Fontes de cotação

### Base cambial

[Currency API](https://github.com/fawazahmed0/exchange-api)

- Projeto aberto sob licença CC0, sem chave de acesso.
- Moeda-base consultada: `CLP`.
- Taxa utilizada: `clp.brl`.
- Data de referência utilizada: `date` no formato `YYYY-MM-DD`.
- Atualização da base: diária.
- Endpoint principal servido pelo jsDelivr.
- Contingência servida pelo espelho oficial no Cloudflare Pages.

Os dois endpoints entregam a mesma base. O segundo existe para manter a atualização disponível caso um dos provedores de distribuição esteja temporariamente fora do ar.

### Interpretação da taxa

A taxa apresentada é uma referência de mercado. O valor efetivamente cobrado por banco, cartão, conta internacional ou casa de câmbio pode incluir:

- spread cambial;
- IOF ou outros tributos;
- tarifa da instituição;
- diferença entre compra e venda;
- arredondamentos próprios do fornecedor.

Por esse motivo, o aplicativo não deve ser utilizado para liquidação financeira, negociação forex ou conferência contábil. Para uma transação, confirme o valor final com a instituição responsável.

## Estrutura do projeto

```text
conversor-clp-brl/
├── js/
│   ├── money.js          # Moedas, máscaras, conversões e divisão
│   ├── rates.js          # Serviços de cotação e contingência
│   └── session-store.js  # Sessão, validação e localStorage
├── tests/
│   ├── money.test.js
│   ├── rates.test.js
│   └── session-store.test.js
├── index.html            # Interface semântica da aplicação
├── style.css             # Design, componentes e responsividade
├── app.js                # Orquestração da experiência
├── sw.js                 # Service Worker e cache offline
├── manifest.json         # Configuração do PWA
├── favicon.ico           # Ícone padrão dos navegadores
├── package.json          # Metadados e comando de testes
├── .gitignore            # Arquivos ignorados pelo Git
├── icon-180.png          # Ícone para dispositivos Apple
├── icon-192.png          # Ícone padrão do PWA
├── icon-512.png          # Ícone de alta resolução
└── README.md             # Documentação do projeto
```

## Execução local

### Pré-requisitos

- Navegador moderno.
- Python 3 ou qualquer servidor HTTP estático.
- Node.js 20 ou superior apenas para executar os testes.

Não abra o `index.html` diretamente pelo protocolo `file://`. Service Workers exigem um contexto seguro, como `localhost` ou HTTPS.

### Iniciar com Python

Na raiz do projeto:

```bash
python3 -m http.server 8080
```

Abra no navegador:

```text
http://localhost:8080
```

Para encerrar o servidor, pressione `Ctrl + C`.

## Testes

O projeto utiliza o test runner nativo do Node.js e não possui dependências externas. Não é necessário executar `npm install`.

```bash
npm test
```

A suíte cobre:

- máscaras e parsing de CLP/BRL;
- fórmulas nos dois sentidos;
- arredondamento em centavos e pesos inteiros;
- divisão exata com distribuição de resíduo;
- criação, persistência e recuperação de sessões;
- descarte seguro de dados corrompidos;
- média entre compra e venda;
- validação da cotação diária e fallback entre os dois espelhos.

## Instalação como aplicativo

### iPhone e iPad

1. Publique o projeto em um endereço HTTPS.
2. Abra o endereço no Safari.
3. Toque em **Compartilhar**.
4. Selecione **Adicionar à Tela de Início**.
5. Confirme em **Adicionar**.

### Android

1. Abra o endereço no Chrome.
2. Acesse o menu do navegador.
3. Selecione **Instalar app** ou **Adicionar à tela inicial**.

## Publicação no GitHub Pages

Nome recomendado para o repositório:

```text
conversor-clp-brl
```

### Criar o histórico Git

```bash
git init
git add .
git commit -m "feat: initial release of CLP/BRL converter"
git branch -M main
git remote add origin https://github.com/rgjuni0r/conversor-clp-brl.git
git push -u origin main
```

### Ativar o GitHub Pages

1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch `main` e a pasta `/root`.
4. Salve e aguarde a publicação.

O endereço padrão será:

```text
https://rgjuni0r.github.io/conversor-clp-brl/
```

Os caminhos do projeto são relativos, permitindo a publicação em um subdiretório do GitHub Pages.

## Configuração e manutenção

### Intervalos e endpoints

As principais configurações estão declaradas em `js/rates.js`:

| Constante | Finalidade | Valor atual |
| --- | --- | --- |
| `PRIMARY_RATE_API_URL` | Endpoint cambial principal. | Currency API via jsDelivr |
| `FALLBACK_RATE_API_URL` | Espelho de contingência. | Currency API via Cloudflare Pages |
| `RATE_REFRESH_INTERVAL_MS` | Frequência com a página visível. | 1 hora |
| `AUTOMATIC_REQUEST_DEBOUNCE_MS` | Proteção contra consultas duplicadas. | 15 segundos |

### Dados persistidos

| Chave | Conteúdo |
| --- | --- |
| `clpBrlRateV2` | Snapshot atômico da última taxa válida, tipo da fonte e data de referência. |
| `clpBrlSessionV1` | Sessão versionada com itens, pessoas, taxas registradas e status. |

Nenhuma informação pessoal é armazenada.

### Atualização do cache do PWA

Ao publicar uma alteração em `index.html`, `style.css`, `app.js`, ícones ou manifesto, incremente a versão da constante `CACHE` em `sw.js`:

```js
const CACHE_PREFIX = "clp-brl-";
const CACHE = `${CACHE_PREFIX}v26`;
```

Esse versionamento força a remoção do cache anterior durante a ativação do novo Service Worker.

### Checklist antes de publicar

- Validar conversões nos dois sentidos.
- Testar as máscaras CLP e BRL em celular e desktop.
- Adicionar itens nos dois sentidos e confirmar os totais.
- Testar divisão com e sem resíduo de arredondamento.
- Fechar, compartilhar e reabrir a conta.
- Recarregar o PWA e confirmar a restauração da sessão.
- Confirmar o horário exibido pela fonte cambial.
- Simular falha da fonte principal e validar a contingência.
- Testar o carregamento offline após o primeiro acesso.
- Verificar instalação e ícones do PWA.
- Incrementar a versão do cache.
- Testar em Safari no iPhone e Chrome no Android.

## Privacidade e segurança

- A aplicação não possui cadastro, cookies próprios ou coleta de dados pessoais.
- Os valores digitados, a taxa e a sessão da conta permanecem no navegador do usuário.
- As consultas cambiais são enviadas diretamente às APIs identificadas neste documento.
- Não existem chaves privadas ou segredos incorporados ao código.
- Em produção, o PWA deve ser servido exclusivamente por HTTPS.
- Links externos abrem com `noopener` e `noreferrer`.

Como o projeto é totalmente client-side, qualquer segredo incluído no JavaScript ficaria público. Caso uma API privada seja adotada no futuro, a integração deverá passar por um backend ou função serverless.

## Limitações conhecidas

- A referência cambial é diária e não acompanha oscilações intradiárias.
- Fins de semana e feriados podem manter a última referência publicada.
- O modo offline depende de um primeiro acesso bem-sucedido para preencher o cache.
- A cotação comercial não representa automaticamente o custo de uma operação de turismo.
- O ajuste manual é substituído quando uma atualização automática posterior é concluída com sucesso.
- A aplicação não apresenta histórico ou gráfico de variação cambial.
- Itens já registrados preservam a cotação original e não são recalculados automaticamente.

## Roadmap

- [ ] Permitir configurar spread e taxas adicionais.
- [ ] Mostrar a taxa inversa (`1 BRL = X CLP`).
- [ ] Permitir recalcular explicitamente todos os itens com a cotação atual.
- [ ] Criar histórico local das últimas cotações.
- [ ] Exportar o recibo como imagem ou PDF.
- [ ] Avaliar uma função serverless para proteger futuras chaves de API.
- [ ] Automatizar a publicação com GitHub Actions.

## Direitos autorais

Desenvolvido por [abc Ensina](https://abcensina.com.br).

Copyright © 2026 abc Ensina. Todos os direitos reservados.

Este projeto não possui licença de código aberto. Nenhuma permissão de uso, cópia, modificação, distribuição ou comercialização é concedida sem autorização expressa do titular dos direitos.
