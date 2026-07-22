(() => {
  const installButton = document.querySelector("#installApp");
  const help = document.querySelector("#installHelp");
  const closeButton = document.querySelector("#installClose");
  const doneButton = document.querySelector("#installDone");
  const message = document.querySelector("#installMessage");
  const steps = document.querySelector("#installSteps");

  if (!installButton || !help || !message || !steps) return;

  let deferredInstallPrompt = null;
  const userAgent = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;

  function setSteps(items) {
    steps.replaceChildren(...items.map(item => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    }));
  }

  function showHelp() {
    if (isIOS) {
      message.textContent = "No iPhone e iPad, a instalação é feita pelo Safari:";
      setSteps([
        "Abra esta página no Safari.",
        "Toque em Compartilhar — o quadrado com uma seta para cima.",
        "Escolha Adicionar à Tela de Início.",
        "Confirme em Adicionar."
      ]);
    } else if (isAndroid) {
      message.textContent = "Se a instalação automática não aparecer, faça pelo Chrome:";
      setSteps([
        "Abra esta página no Chrome.",
        "Toque no menu de três pontos.",
        "Escolha Instalar aplicativo ou Adicionar à tela inicial.",
        "Confirme a instalação."
      ]);
    } else {
      message.textContent = "Abra o Bordo no celular para instalá-lo como aplicativo:";
      setSteps([
        "No Android, use o Chrome e escolha Instalar aplicativo.",
        "No iPhone, use o Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
      ]);
    }

    help.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton?.focus();
  }

  function hideHelp() {
    help.hidden = true;
    document.body.style.overflow = "";
    installButton.focus();
  }

  function markAsInstalled() {
    deferredInstallPrompt = null;
    installButton.textContent = "App já instalado";
    installButton.disabled = true;
  }

  if (isStandalone) markAsInstalled();

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.textContent = "Baixar o app";
    installButton.disabled = false;
  });

  window.addEventListener("appinstalled", markAsInstalled);

  installButton.addEventListener("click", async () => {
    if (isStandalone) return;

    if (!deferredInstallPrompt) {
      showHelp();
      return;
    }

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;

    if (choice.outcome === "accepted") {
      installButton.textContent = "Instalando…";
      installButton.disabled = true;
    }
  });

  closeButton?.addEventListener("click", hideHelp);
  doneButton?.addEventListener("click", hideHelp);
  help.addEventListener("click", event => {
    if (event.target === help) hideHelp();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !help.hidden) hideHelp();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {});
    });
  }
})();
