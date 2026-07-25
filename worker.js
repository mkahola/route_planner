export default {
  async fetch(request, env, ctx) {
    // Määritetään CORS-otsikot heti alussa globaalisti
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // Pysäytetään OPTIONS-pyyntö välittömästi tässä ja palautetaan 200 OK.
    // Tämä estää 405-virheen, jos selain tekee esitarkistuksen.
    if (request.method.toUpperCase() === "OPTIONS") {
      return new Response(null, {
        status: 204, // No Content, mutta hyväksytty
        headers: corsHeaders
      });
    }

    // Sallitaan GET-testaus osoiteriviltä
    if (request.method.toUpperCase() === "GET") {
      const apiKey = env?.ORS_API_KEY || (typeof ORS_API_KEY !== 'undefined' ? ORS_API_KEY : null);
      if (!apiKey) {
        return new Response("❌ Avaimesi puuttuu vielä Workerin Settings -> Variables -osiosta!", {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders }
        });
      }
      return new Response("✅ Worker valmiina! ORS_API_KEY tunnistettu.", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders }
      });
    }

    // Käsitellään kartalta tuleva POST-reittipyyntö
    if (request.method.toUpperCase() === "POST") {
      try {
        const apiKey = env?.ORS_API_KEY || (typeof ORS_API_KEY !== 'undefined' ? ORS_API_KEY : null);
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "API-avain puuttuu palvelimelta." }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const requestBody = await request.json();

        // Kutsutaan OpenRouteServicea taustalla
        const orsResponse = await fetch(
          "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Authorization": apiKey
            },
            body: JSON.stringify(requestBody)
          }
        );

        const data = await orsResponse.json();

        return new Response(JSON.stringify(data), {
          status: orsResponse.status,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: "Workerin sisäinen virhe: " + error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      }
    }

    // Jos pyyntö on jotain muuta, palautetaan 405 otsikoiden kanssa
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders
    });
  }
};
