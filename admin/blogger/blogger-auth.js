const loginShell = document.querySelector("#bloggerLogin");
const appShell = document.querySelector(".app-shell");
const loginForm = document.querySelector("#bloggerLoginForm");
const loginStatus = document.querySelector("#bloggerLoginStatus");
const logoutButton = document.querySelector("#bloggerLogout");

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "authentication_failed");
  return body;
}

async function session() {
  try {
    return await request("/api/admin/session");
  } catch {
    return null;
  }
}

async function exchangeLaunchCode() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return false;
  await request("/admin/blogger/launch", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  url.searchParams.delete("code");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
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

export async function getBloggerAccessToken() {
  return (await session()) ? "cookie-session" : "";
}

logoutButton.addEventListener("click", async () => {
  await request("/api/admin/logout", { method: "POST" });
  window.location.reload();
});
