# El revisor de código en integración continua

El trabajo [`claude-review.yml`](../.github/workflows/claude-review.yml) lanza el revisor adversarial
sobre cada cambio propuesto y publica lo que encuentre **como comentarios en el pull request**, no
como un retazo en el registro de ejecución.

Este documento explica lo que falta para que eso funcione de verdad y dónde se va el dinero.

## Qué hace el trabajo, en una pasada

1. Clona el repositorio con el histórico completo.
2. Arranca el revisor con la acción oficial [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action).
3. El revisor lee `.claude/agents/adversarial-reviewer.md` —el archivo de calibración— y el diff
   del cambio, y publica cada hallazgo como comentario en línea.

El agente **solo lee**: sus herramientas permitidas son `Read`, `Grep` y `Glob`, más la herramienta
de comentarios en línea, que es la única forma que tiene de escribir. No puede commitear, no puede
tocar las rutas y no puede crear ficheros.

Y no es una promesa, es la configuración: `--tools "Read,Grep,Glob"` deja disponibles solo las
herramientas de lectura y `--disallowedTools "Write,Edit,NotebookEdit,Bash"` quita explícitamente
las de escritura. El `--allowedTools` del workflow es **otra cosa** —es la lista de lo que se ejecuta
sin preguntar, y es lo que hace que la acción arranque el servidor de comentarios en línea—, así que
que también lleve las tres de lectura.

**Una limitación que conviene conocer:** el comentario en línea solo se puede anclar a una línea del
diff. Un hallazgo sobre un fichero que el cambio no toca —la spec, el frontend, un ADR— no se puede
publicar como comentario: se queda en la respuesta del revisor, en el registro del run. Por eso el
prompt le dice que avise de esos casos en su respuesta final, y por eso el prompt también le dice que
publique cada hallazgo en cuanto lo tenga y no todos al final: con un reloj de diez minutos, una
revisión que acumula los hallazgos para el final puede no publicar ninguno.

## Qué pasos manuales quedan pendientes

**Uno, y es el bloqueante: la credencial.** GitHub no trae ninguna, y el trabajo no puede arrancar
sin ella. Se explica justo debajo.

**Opcionales:**

- **La app de Claude en GitHub**, si prefieres que la acción se autentique con ella en vez de con
  el `GITHUB_TOKEN` del workflow. Con el `GITHUB_TOKEN` —que es lo que hace este workflow— no hace
  falta instalar nada.
- **Un paso de revisión manual**: con `pull-requests: write` el revisor puede comentar, pero no
  puede aprobar ni pedir cambios. Si quieres que el propio bot bloquee el merge, hay que darle más
  permisos, y eso ya es otra decisión.

Mientras la credencial no esté puesta, el trabajo **se salta** en vez de fallar: el paso de la acción
lleva un `if` que solo lo ejecuta si el secreto existe. Sin eso, la acción abortaría al validar las
credenciales y todos los pull requests se quedarían en rojo hasta que se pusiera el secreto.

## La credencial: dos caminos, y no son intercambiables

Los dos se configuran en **Settings → Secrets and variables → Actions** del repositorio, como
secretos del repositorio. Los dos son de tipo *secret*, no *variable*.

### Camino 1 — suscripción de Claude (el que se recomienda primero)

Se paga con la suscripción que ya tienes (Pro, Max, Ultra, Team o Enterprise), no con saldo de API.

1. En local, con la CLI instalada:

   ```bash
   claude setup-token
   ```

   Abre el navegador, autorizas y **el token se imprime en la terminal**. No se guarda en ningún
   sitio: cópialo tú.

2. Creas el secreto **`CLAUDE_CODE_OAUTH_TOKEN`** con ese valor.

3. En el workflow:

   ```yaml
   claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
   ```

El token dura un año y está atado a la suscripción de quien lo generó. Si el secreto se va a
compartir entre repositorios, la propia documentación desaconseja este camino: un token OAuth
pertenece a una persona, y lo que se comparte entre repositorios debería ser una clave de API.

### Camino 2 — clave de API de la consola de Anthropic

Se paga con saldo de API, y las facturas van a la cuenta de la consola.

1. Creas una clave en la consola de Anthropic.
2. Creas el secreto **`ANTHROPIC_API_KEY`** con ese valor.
3. En el workflow:

   ```yaml
   anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

### ⚠️ No los cruces

`claude_code_oauth_token` y `anthropic_api_key` son entradas distintas y **no son intercambiables**.
Si le pasas el valor de una en la entrada de la otra, la comprobación previa **no lo detecta**,
porque solo mira que haya algo en la variable: el trabajo **falla en la primera llamada**, al
autenticar, con un error de credenciales que no dice «has usado la entrada equivocada». Es la
forma más fácil de perder media hora.

Si cambias de camino, cambia **las dos cosas a la vez**: la entrada del workflow y el nombre del
secreto.

### ⚠️ El vector que no es de los forks: el workflow del propio pull request

Esto no va de forks, va del caso normal, y conviene saberlo antes de poner el secreto.

En el evento `pull_request`, GitHub ejecuta **la definición del workflow que viene en la rama del
pull request** —no la de la rama base— siempre que el pull request venga del mismo repositorio. Y
los secretos del repositorio están disponibles en ese run.

Traducido: **alguien con permiso de escritura puede editar `.github/workflows/claude-review.yml` en
su pull request y dejar ahí un `run:` que se imprima el secreto**. El job se ejecutaría con el
secreto a la vista y bastaría con que el revisor publicara ese valor.

No es un fallo del workflow: es cómo funciona `pull_request`, y no tiene arreglo dentro del
workflow. Lo que sí se puede decidir:

- **Confiar en quien tiene permiso de escritura.** Quien puede empujar al repositorio ya puede
  cambiar el código que se revisa; el secreto es el único extra que se les da.
- **Preferir el camino 2 (clave de API de la consola) al camino 1 (suscripción).** El token de
  suscripción es de una persona y da acceso a su cuota; una clave de API se puede acotar, rotar y
  revocar sin dar de alta a nadie.
- **Fijar la acción a un SHA en vez de a una etiqueta móvil.** `anthropics/claude-code-action@v1`
  es una etiqueta que se mueve; un SHA no. Es la defensa habitual contra un compromiso de la
  cadena de suministro, y aquí importa más de lo normal porque el job tiene un secreto.
- **Revisar los pull requests de los colaboradores de confianza antes de aprobarlos.**

## Dónde se va el dinero

El revisor usa **`sonnet`** con `--effort medium`. Ni uno ni otro es casual:

- **`sonnet`** porque es el punto medio: en este repositorio, que es pequeño y con la spec escrita,
  saber detectar un contrato incumplido o un caso límite sin manejar es un trabajo de modelo medio.
  Con `opus` se puede afinar más, pero el coste se multiplica en cada push.
- **`--effort medium`** porque el revisor no tiene que adivinar: lee un diff acotado y lo contrasta
  contra criterios conocidos. `high` gastaría más pensamiento en cada turno sin cambiar el
  resultado, y `low` se le escapan los casos raros.

**Cómo cambiarlo:** se cambia en `claude_args`, en `.github/workflows/claude-review.yml`.

| Quiero | Cambio |
|---|---|
| Revisar más a fondo | `--model opus` |
| Barrido más barato | `--model haiku` |
| Razonar más por turno | `--effort high` |
| Gastar menos por turno | `--effort low` |

**El precio exacto no está aquí a propósito.** Cambia, y una cifra escrita en un documento envejece
sin que nadie se entere. Los sitios donde mirar:

- [Precios por modelo de la API](https://platform.claude.com/docs/en/about-claude/pricing) — lo que
  cuesta cada modelo por token.
- [Planes de Claude](https://claude.com/pricing) — lo que cuesta la suscripción, que es lo que se
  paga con el camino 1.
- [Gestión de coste de Claude Code](https://code.claude.com/docs/en/costs.md) — cómo se controla el
  gasto desde la propia herramienta.

Un detalle que cambia el cálculo: con el camino 1 el consumo sale de la **cuota de tu suscripción**,
no de una factura de API. Con el camino 2 es dinero de la consola, y por token.

## Los cambios propuestos desde un fork

En un repositorio **público**, un pull request desde un fork **no se revisa**, y el trabajo
**falla** en lugar de pasarse por alto. Hay dos razones independientes, y las dos están en el camino:

1. **La acción comprueba quién ha abierto el pull request.** Exige que tenga permiso de `write` o
   de `admin` en el repositorio; si no lo tiene, se detiene con `Actor does not have write
   permissions to the repository`. Quien abre un PR desde un fork no tiene ese permiso en el
   repositorio base.
2. **GitHub no le da los secretos del repositorio a los runs de un fork.** El workflow corre, pero
   `CLAUDE_CODE_OAUTH_TOKEN` llega vacío, y la acción aborta al validar las credenciales: `Either
   ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or workload identity federation [...] is
   required`.

La causa de fondo es la misma en los dos casos: **el secreto es un secreto del repositorio, y los
repositorios públicos no lo comparten con los forks**, porque el fork lo controla cualquiera. No es
un fallo del workflow: es el diseño de GitHub.

- **PRs desde ramas del mismo repositorio**: se revisan, sin problema. Es el caso normal de un
  repositorio con varios colaboradores.
- **PRs desde un fork**: no se revisan, y el PR se queda con un trabajo en rojo.

### Qué se puede hacer

- **`allowed_non_write_users`**: la entrada de la acción que deja pasar a quien no tenga permiso de
  escritura. Solo funciona si se pasa `github_token` —que este workflow pasa—, salta **la primera**
  de las dos comprobaciones pero **no la segunda**: el secreto sigue sin llegar. Es decir: sirve
  para PRs de gente sin permiso de escritura **dentro del mismo repositorio**, no para forks de un
  repositorio público. Y la propia acción avisa de que saltarse esa comprobación expone el
  workflow a inyección de prompt.
- **`pull_request_target`**: sí recibe los secretos del repositorio base, porque se ejecuta en el
  contexto del repositorio base. Pero es peligroso: da acceso a los secretos a un workflow que
  puede acabar tocando código no confiable, y la documentación de la acción lo advierte
  explícitamente. Si se usa, el revisor **no debe** hacer checkout del código del fork ni ejecutar
  nada suyo, porque leer ese código con un secreto a la vista ya es un vector de inyección de
  prompt.
- **Mención manual**: comentar `@claude` en el pull request dispara la revisión. Ojo: **no funciona
  en pull requests desde forks**, según la documentación oficial.
- **Ejecutar la revisión en local**, antes de abrir el pull request, con la CLI y el mismo
  archivo de calibración.

### La protección que trae de serie

La acción trae `restrict_untrusted_prs` en `true` por defecto: en los pull requests cuyo autor no
tiene permiso de escritura, deniega los comandos que ejecutan código del checkout —gestores de
paquetes, runners de tests, intérprete, shell— aunque `claude_args` los permita. No es una caja de
arena y no cubre todos los caminos de ejecución, así que el trabajo no le da permisos de `Bash` de
todas formas: el revisor solo lee y comenta.

Y hay una más que no se ve pero importa: **hoy, en cualquier pull request, la acción restaura
`.claude/` y `.mcp.json` desde la rama base** antes de que el CLI los lea. El archivo de calibración
que lee el revisor es, por tanto, **el de la rama base**, no el que traiga el cambio: un pull request
no puede reescribir las reglas con las que se le juzga.

Eso es una garantía **de la acción**, no del repositorio: si la acción cambiara de comportamiento,
el revisor leería el `.claude/agents/adversarial-reviewer.md` del pull request, es decir, las reglas
con las que se le juzga las escribiría el autor del cambio. Si alguna vez se ve raro, es el primer
sitio donde mirar.

## Referencia

- [Acción oficial de Claude Code para GitHub Actions](https://github.com/anthropics/claude-code-action)
- [Documentación de Claude Code en GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Autenticación de Claude Code](https://code.claude.com/docs/en/authentication)
