fetch("https://r.jina.ai/https://www.list.am/item/24181304", {
    headers: {
        "X-Return-Format": "html",
        "User-Agent": "Mozilla/5.0 Agent1",
    },
}).then(async (response) => {
    const html = await response.text();
    const dump = (label, index, span = 700) => {
        console.log(`\n==== ${label} @ ${index} ====`);
        if (index < 0) {
            return;
        }
        console.log(html.slice(index, index + span));
    };

    dump("h1", html.search(/<h1/i), 400);
    dump("loc", html.search(/class="loc"/), 2500);
    dump("desc", html.search(/class="body"|id="body"|itemprop="description"|class="txt"/), 1500);
    dump("po117", html.search(/po117\.init|gallery-image/), 400);

    const imgs = html.match(/\/\/img\.list\.am\/[^"'>\s]+/g) || [];
    console.log("\nimages", imgs.slice(0, 8), "count", imgs.length);
});
