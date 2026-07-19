# Conta Chile · Conversor CLP ⇄ BRL

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

O Conta Chile foi projetado como um companheiro de viagem: a aplicação converte valores, registra cada gasto com a taxa utilizada naquele momento, apresenta os totais nas duas moedas e distribui a conta entre até 99 pessoas.

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
- Nova consulta a cada minuto enquanto a página estiver visível.
- Cotação intradiária baseada na média entre compra e venda.
- Fonte diária de contingência quando a fonte principal não responde.
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

## Arquitetura

A aplicação utiliza uma arquitetura client-side estática. Toda a interface, conversão, persistência e comunicação com as APIs são executadas diretamente no navegador.

```mermaid
flowchart TD
    U[Usuário] --> UI[Interface HTML e CSS]
    UI --> APP[Orquestração em app.js]
    APP --> MONEY[js/money.js<br/>máscaras, inteiros e divisão]
    APP --> SESSION[js/session-store.js<br/>sessão versionada]
    APP --> RATES[js/rates.js<br/>fontes e fallback]
    RATES --> PRIMARY[AwesomeAPI<br/>cotação intradiária]
    PRIMARY -->|sucesso| STORE[localStorage]
    PRIMARY -->|falha| FALLBACK[ExchangeRate-API<br/>referência diária]
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
| `js/rates.js` | Consulta intradiária, timeout e fonte diária de contingência. |
| `js/session-store.js` | Modelo versionado, validação e persistência da conta. |
| `sw.js` | Cache dos arquivos locais e funcionamento offline do shell. |
| `manifest.json` | Nome, ícones, cores e comportamento de instalação do PWA. |
| `tests/` | Testes automatizados de moeda, sessão, divisão e fontes cambiais. |
| `localStorage` | Última taxa válida e sessão atual da conta. |

### Estratégia de resiliência

1. A aplicação solicita a cotação intradiária CLP/BRL.
2. Quando compra e venda estão disponíveis, utiliza a média entre elas.
3. Se a fonte principal falhar, consulta a fonte diária de contingência.
4. Se as duas consultas falharem, mantém a última taxa salva no dispositivo.
5. Se não existir uma taxa salva, utiliza apenas a referência inicial incorporada ao aplicativo e informa que não foi possível atualizar.

O timeout de cada consulta é de 10 segundos. As tentativas automáticas próximas são limitadas para evitar requisições duplicadas, e a contingência diária não é consultada repetidamente a cada minuto.

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

O resultado em BRL é armazenado em centavos inteiros e o resultado em CLP em pesos inteiros. A conversão arredonda uma única vez para a menor unidade exibida; totais e divisões somam esses inteiros, evitando erros acumulados de ponto flutuante.

Quando o total não é divisível igualmente, o app informa quantas pessoas absorvem a unidade restante. Exemplo: `R$ 100,00 ÷ 3` resulta em uma pessoa pagando `R$ 33,34` e duas pagando `R$ 33,33`.

## Fontes de cotação

### Fonte principal

[AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas)

- Par consultado: `CLP-BRL`.
- Campos utilizados: `bid`, `ask` e `timestamp`.
- Taxa aplicada: média aritmética entre compra e venda.
- Consultas sem chave podem permanecer em cache por até um minuto.

```text
taxa média = (compra + venda) ÷ 2
```

### Fonte de contingência

[ExchangeRate-API](https://www.exchangerate-api.com/docs/free)

- Moeda-base consultada: `CLP`.
- Taxa utilizada: `rates.BRL`.
- Atualização da modalidade aberta: diária.

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
- fallback da cotação intradiária para a diária.

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
| `REALTIME_RATE_API_URL` | Endpoint da fonte intradiária. | AwesomeAPI `CLP-BRL` |
| `DAILY_RATE_API_URL` | Endpoint diário de contingência. | ExchangeRate-API `CLP` |
| `RATE_REFRESH_INTERVAL_MS` | Frequência com a página visível. | 60 segundos |
| `AUTOMATIC_REQUEST_DEBOUNCE_MS` | Proteção contra consultas duplicadas. | 15 segundos |
| `DAILY_FALLBACK_INTERVAL_MS` | Intervalo mínimo da contingência automática. | 1 hora |

### Dados persistidos

| Chave | Conteúdo |
| --- | --- |
| `clpToBrl` | Última taxa CLP/BRL válida. |
| `rateUpdatedAt` | Horário em que o navegador salvou a taxa. |
| `rateSourceUpdatedAt` | Horário de referência informado pela fonte. |
| `rateSourceKind` | Tipo da fonte: `realtime` ou `daily`. |
| `clpBrlSessionV1` | Sessão versionada com itens, pessoas, taxas registradas e status. |

Nenhuma informação pessoal é armazenada.

### Atualização do cache do PWA

Ao publicar uma alteração em `index.html`, `style.css`, `app.js`, ícones ou manifesto, incremente a versão da constante `CACHE` em `sw.js`:

```js
const CACHE_PREFIX = "clp-brl-";
const CACHE = `${CACHE_PREFIX}v15`;
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

- A fonte intradiária sem autenticação pode aplicar cache ou limitação de requisições.
- Mercados fechados podem manter a última cotação do período anterior.
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
