// Find TODO statements and complete them to build the interactive airline route map.

// Add your uniqname to the HTML so your work can be identified
document.getElementById("uniqname").textContent = "jorsanto"; // TODO: replace with your uniqname

// Import data using d3.csv()
const dataFile = await d3.csv('data/routes.csv');

const colornone = "#ccc";
const colorin = "#4169e1";   // blue — incoming routes
const colorout = "#e05c00";  // orange-red — outgoing routes

// define colors for airlines: WN = Southwest, B6 = JetBlue
const airlineColor = { WN: "orange", B6: "steelblue" };
const airlineName = { WN: "Southwest Airlines", B6: "JetBlue" };

// collect unique airlines from the data and prepend "all"
const airlines = ["all", ...new Set(dataFile.map(d => d.Airline))];

// build the dropdown selector
const select = d3.select("body")
    .insert("select", "#chart")
    .on("change", function () { draw(this.value); });

select.selectAll("option")
    .data(airlines)
    .join("option")
    .attr("value", d => d)
    .text(d => d === "all" ? "All Airlines" : (airlineName[d] || d));

// helper: builds outgoing links for each leaf node as [source, target, airline] tuples
function bilink(root) {
    const map = new Map(root.leaves().map(d => [id(d), d]));
    for (const d of root.leaves()) {
        d.outgoing = d.data.destinations
            .map(({ target, airline, targetRegion }) => [d, map.get(`root/${targetRegion}/${target}`), airline])
            .filter(([, target]) => target !== undefined);
    }
    return root;
}

// helper: generates a unique hierarchical ID for a node, e.g. "root/US-Northeast/JFK"
function id(node) {
    return `${node.parent ? id(node.parent) + "/" : ""}${node.data.name}`;
}

// rebuild hierarchy and redraw when airline filter changes
function draw(airlineFilter) {
    const filtered = airlineFilter === "all"
        ? dataFile
        : dataFile.filter(d => d.Airline === airlineFilter);

    const grouped = d3.group(filtered, d => d["Source region"], d => d["Source airport"]);

    const hierarchyData = {
        name: "root",
        children: Array.from(grouped, ([region, airports]) => ({
            name: region,
            children: Array.from(airports, ([airport, routes]) => ({
                name: airport,
                destinations: routes.map(r => ({
                    target: r["Destination airport"],
                    airline: r.Airline,
                    targetRegion: r["Destination region"]
                }))
            }))
        }))
    };

    document.getElementById("chart").innerHTML = "";
    document.getElementById("chart").appendChild(createChart(hierarchyData));
}

draw("all"); // initial render


// Adapted from https://observablehq.com/@d3/hierarchical-edge-bundling
function createChart(data) {
    const width = 954;
    const radius = width / 2;

    // cluster layout maps nodes onto a circle
    const tree = d3.cluster().size([2 * Math.PI, radius - 100]);

    // build the d3 hierarchy, sort interior nodes before leaves so the
    // cluster layout places them correctly, then attach outgoing links
    const root = tree(
        bilink(
            d3.hierarchy(data)
                .sort((a, b) =>
                    d3.ascending(a.height, b.height) ||
                    d3.ascending(a.data.name, b.data.name)
                )
        )
    );

    // bilink() only builds outgoing; build incoming here so hover + tooltip work
    for (const leaf of root.leaves()) leaf.incoming = [];
    for (const leaf of root.leaves()) {
        for (const lnk of leaf.outgoing) {
            lnk[1].incoming.push(lnk);
        }
    }

    // radial line generator with bundle tension 0.85
    const line = d3.lineRadial()
        .curve(d3.curveBundle.beta(0.85))
        .radius(d => d.y)
        .angle(d => d.x);

    const svg = d3.create("svg")
        .attr("width", width)
        .attr("height", width)
        .attr("viewBox", [-width / 2, -width / 2, width, width])
        .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    // draw one path per route, colored by airline
    const link = svg.append("g")
        .attr("fill", "none")
        .attr("stroke-opacity", 0.6)
        .selectAll("path")
        .data(root.leaves().flatMap(leaf => leaf.outgoing))
        .join("path")
        .style("mix-blend-mode", "multiply")
        .attr("stroke", d => airlineColor[d[2]] || colornone)
        .attr("d", ([i, o]) => line(i.path(o)))
        .each(function(d) { d.path = this; }); // store DOM ref on the datum for fast hover lookup

    // draw one text label per airport (leaf node)
    const node = svg.append("g")
        .selectAll("g")
        .data(root.leaves())
        .join("g")
        .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`)
        .append("text")
        .attr("dy", "0.31em")
        .attr("x", d => d.x < Math.PI ? 6 : -6)
        .attr("text-anchor", d => d.x < Math.PI ? "start" : "end")
        .attr("transform", d => d.x >= Math.PI ? "rotate(180)" : null)
        .text(d => d.data.name)
        .each(function(d) { d.text = this; }) // store DOM ref on the datum for fast hover lookup
        .on("mouseover", overed)
        .on("mouseout", outed)
        // native browser tooltip: airport code, region, route counts
        .call(text => text.append("title")
            .text(d => [
                d.data.name,
                `Region: ${d.parent.data.name}`,
                `Incoming routes: ${d.incoming.length}`,
                `Outgoing routes: ${d.outgoing.length}`
            ].join("\n"))
        );

    function overed(event, d) {
        // dim all links, then highlight only connected ones
        link.attr("stroke", colornone).attr("stroke-opacity", 0.15);
        d3.select(this).attr("font-weight", "bold");

        // incoming: color the path and the source airport label
        d3.selectAll(d.incoming.map(l => l.path))
            .attr("stroke", colorin).attr("stroke-opacity", 1).raise();
        d3.selectAll(d.incoming.map(l => l[0].text))
            .attr("fill", colorin).attr("font-weight", "bold");

        // outgoing: color the path and the destination airport label
        d3.selectAll(d.outgoing.map(l => l.path))
            .attr("stroke", colorout).attr("stroke-opacity", 1).raise();
        d3.selectAll(d.outgoing.map(l => l[1].text))
            .attr("fill", colorout).attr("font-weight", "bold");
    }

    function outed(event, d) {
        // restore all links to their original airline colors
        link.attr("stroke", l => airlineColor[l[2]] || colornone).attr("stroke-opacity", 0.6);
        d3.select(this).attr("font-weight", null);

        // restore source and destination labels
        d3.selectAll(d.incoming.map(l => l[0].text)).attr("fill", null).attr("font-weight", null);
        d3.selectAll(d.outgoing.map(l => l[1].text)).attr("fill", null).attr("font-weight", null);
    }

    return svg.node();
}
