import { consumeStudioLaunchFragment, fetchBloggerJson, normalizePastedHtml } from "./blogger-auth-core.js";

const loginShell = document.querySelector("#bloggerLogin");
const appShell = document.querySelector(".app-shell");
const loginForm = document.querySelector("#bloggerLoginForm");
const loginStatus = document.querySelector("#bloggerLoginStatus");
const logoutButton = document.querySelector("#bloggerLogout");
const visualEditor = document.querySelector("#visualEditor");

async function request(url, options = {}) {
  return fetchBloggerJson(fetch, url, options);
}

async function session() {
  try {
    return await request("/api/admin/session");
  } catch {
    return null;
  }
}

async function exchangeLaunchCode() {
  return consumeStudioLaunchFragment({
    location: window.location,
    replaceUrl: (url) => history.replaceState(null, "", url),
    request,
  });
}

function showEditor() {
  loginShell.hidden = true;
  appShell.hidden = false;
}

function showLogin() {
  loginShell.hidden = false;
  appShell.hidden = true;
}

export async function requireBloggerAccess() {
  try {
    await exchangeLaunchCode();
  } catch {
    loginStatus.textContent = "El enlace de Studio no es válido o ha caducado.";
  }
  if (await session()) {
    showEditor();
    return true;
  }
  showLogin();
  return new Promise((resolve) => {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      loginStatus.textContent = "Comprobando acceso…";
      const submit = loginForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await request("/admin/blogger/login", {
          method: "POST",
          body: JSON.stringify({
            username: loginForm.elements.username.value,
            password: loginForm.elements.password.value,
            remember: loginForm.elements.remember.checked,
          }),
        });
        loginForm.reset();
        showEditor();
        resolve(true);
      } catch {
        loginStatus.textContent = "Usuario o contraseña incorrectos.";
      } finally {
        submit.disabled = false;
      }
    });
  });
}

visualEditor.addEventListener("paste", (event) => {
  const html = event.clipboardData?.getData("text/html") ?? "";
  const text = event.clipboardData?.getData("text/plain") ?? "";
  event.preventDefault();
  if (html) document.execCommand("insertHTML", false, normalizePastedHtml(html));
  else document.execCommand("insertText", false, text);
  visualEditor.dispatchEvent(new Event("input", { bubbles: true }));
});

export async function bloggerApiRequest(url, options) {
  return request(url, options);
}

logoutButton.addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST" });
  window.location.reload();
});
