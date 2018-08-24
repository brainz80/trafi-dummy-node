const _ = require('lodash');
const bodyParser = require('body-parser');
const express = require('express');
const fs = require('fs');
const Handlebars = require('handlebars');
const http = require('http');
const iconv = require('iconv-lite');
const moment = require('moment');
const parser = require('fast-xml-parser');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = 8080;

const ResultCollection = {
	$laaja: 'kehys.sanoma.ajoneuvontiedot.laaja.tunnus',
	$historia: 'kehys.sanoma.ajoneuvontiedot.historia.tunnus',

	items: {},

	get parsed () {
		return _.mapValues(this.items, parser.parse);
	},

	addOrUpdate (file, text) {
		this.items[file] = text;
	},

	remove (file) {
		delete this.items[file];
	},

	getByReg (value, raw = true) {
		const parsed = this.parsed;
		let index = _.findKey(parsed, [`${this.$laaja}.rekisteritunnus`, value]);

		if (_.isUndefined(index)) {
			index = _.findKey(parsed, [`${this.$laaja}.edellinenRekisteritunnus`, value]);
		}

		if (_.isUndefined(index)) {
			index = _.findKey(parsed, [`${this.$historia}.rekisteritunnus`, value]);
		}

		if (_.isUndefined(index)) {
			index = _.findKey(parsed, [`${this.$historia}.edellinenRekisteritunnus`, value]);
		}

		return raw ? this.items[index] : parsed[index];
	},

	getByVin (value, raw = true) {
		const parsed = this.parsed;
		let index = _.findKey(parsed, [`${this.$laaja}.valmistenumero`, value]);

		if (_.isUndefined(index)) {
			index = _.findKey(parsed, [`${this.$historia}.valmistenumero`, value]);
		}

		return raw ? this.items[index] : parsed[index];
	},
};

const noResponse = `<?xml version="1.0" encoding="ISO-8859-1"?>
<kehys>
	<yleinen>
		<sanomatyyppi>VIRHE</sanomatyyppi>
		<virhe>
			<virheluokka>halytys</virheluokka>
			<virhekoodi>103</virhekoodi>
			<virheselite>Ajoneuvoa ei löytynyt tietokannasta (eli Trafi-kansiosta)</virheselite>
		</virhe>
	</yleinen>
	<sanoma></sanoma>
</kehys>`;

const basePath = './responses';

const responses = fs.readdirSync(basePath);

if (responses) {
	process.stdout.write(`preparing responses (${responses.length}) ... `);

	// initialize responses
	_.each(responses, file => {
		const response = fs.readFileSync(path.join(basePath, file));

		if (file && response) {
			const text = iconv.decode(response, 'latin1');
			ResultCollection.addOrUpdate(file, text);
		}
	});

	process.stdout.write('done\n');

	const app = express();
	app.use(bodyParser.raw({
		type: 'text/xml',
		inflate: true,
		limit: '100kb',
	}));

	function getResponse (req, res) {
		let request, json;

		if (request = req.body) {
			request = request.toString('utf8');

			res.set('Content-Type', 'text/plain');

			if (json = parser.parse(request)) {
				const hakutiedot = _.get(json, 'kehys.sanoma.ajoneuvonHakuehdot');

				if (hakutiedot) {
					const reg = hakutiedot.rekisteritunnus;
					const vin = hakutiedot.valmistenumero;
					let response;

					res.set('Content-Type', 'application/xml');

					if (response = ResultCollection.getByReg(reg)) {
						res.end(response);
					} else if (response = ResultCollection.getByVin(vin)) {
						res.end(response);
					} else {
						res.end(noResponse);
					}
				}
			} else {
				process.stderr.write(`${req.ip} parse failed.\n`);
				res.end('parse failed.');
			}
		} else {
			process.stderr.write(`${req.ip} no body.\n`);
			res.end('no body.');
		}
	}

	app.get('/xml/:name', (req, res) => {
		res.sendFile(req.params.name, {
			dotfiles: 'deny',
			root: basePath,
			headers: {
				'Content-Type': 'application/xml; charset=ISO-8859-1',
			}
		});
	});

	app.get('/info', (req, res) => {
		res.set('Content-Type', 'text/html');

		Handlebars.registerHelper('xmllink', file => {
			file = Handlebars.escapeExpression(file);
			return new Handlebars.SafeString(`<a target="_blank" href="/xml/${file}">${file}</a>`);
		});
		Handlebars.registerHelper('default', value => value || '--');
		Handlebars.registerHelper ('date', value => {
			const m = moment(value, 'YYYYMMDD');
			if (m.isValid()) {
				return new Handlebars.SafeString(`<span>${ m.format('DD.MM.YYYY') } (${ m.fromNow() })</span>`);
			} else if (value) {
				const year = String.prototype.substring.call(value, 0, 4);
				return Handlebars.helpers.date(`${year}0101`);
			} else {
				return Handlebars.helpers.default();
			}
		});

		const template = Handlebars.compile(`<html>
	<head>
		<link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.1.3/css/bootstrap.min.css">
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.2.0/css/solid.css" integrity="sha384-wnAC7ln+XN0UKdcPvJvtqIH3jOjs9pnKnq9qX68ImXvOGz2JuFoEiCjT8jyZQX2z" crossorigin="anonymous">
		<link rel="stylesheet" href="https://use.fontawesome.com/releases/v5.2.0/css/fontawesome.css" integrity="sha384-HbmWTHay9psM8qyzEKPc8odH4DsOuzdejtnr+OFtDmOcIVnhgReQ4GZBH7uwcjf6" crossorigin="anonymous">

		<style type="text/css">
			#list {
				margin: 1em auto;
				width: 80%;
			}

			.table td, .table th {
				white-space: nowrap;
			}

			.table th {
				background-color: #fff;
				position: sticky;
				top: 0;
				z-index: 10;
			}

			.sort:after {
				font-family: "Font Awesome 5 Free";
				font-weight: 900;
				margin-left: 1em;
				content: '';
			}
			.sort.asc:after {
				content: '\\f0de';
			}
			.sort.desc:after {
				content: '\\f0dd';
			}

			.error {
				color: red;
			}
		</style>
		<title>Trafi dummy - Info</title>
	</head>
	<body>
		<div id="list">
			<form>
				<input class="search" placeholder="Hae ...">
			</form>

			<table class="table table-striped">
				<thead>
					<tr>
						<th class="sort" data-sort="id">Tiedosto</th>
						<th class="sort" data-sort="type">Tyyppi</th>
						<th class="sort" data-sort="reg">Rekisteritunnus</th>
						<th class="sort" data-sort="vin">Valmistenumero</th>
						<th class="sort" data-sort="date">Kayttöönottopäivä</th>
						<th class="sort" data-sort="type">Ajoneuvoluokka</th>
						<th class="sort" data-sort="make">Merkki</th>
						<th class="sort" data-sort="model">Malli ja merkintä</th>
					</tr>
				</thead>
				<tbody class="list">
				{{#each items}}
					<tr>
						<td class="id">{{ xmllink @key }}</td>
						<td>
							<span class="type">{{ type }}</span>
							{{#with error}}
								<span class="error" title="{{ virheselite }}">({{ virhekoodi }})</span>
							{{/with}}
						</td>
						{{#with data}}
							{{#with tunnus}}
								<td>
									{{#if rekisteritunnus}}
										<span class="reg">{{ rekisteritunnus }}</span>
									{{/if}}
									{{#if edellinenRekisteritunnus}}
										<i class="fa fa-arrow-left"></i>
										<span class="reg">{{ edellinenRekisteritunnus }}</span>
									{{/if}}
								</td>
								<td class="vin">{{ default valmistenumero }}</td>
							{{else}}
								<td class="reg">--</td>
								<td class="vin">--</td>
							{{/with}}
							<td class="date" data-timestamp="{{ajoneuvonPerustiedot.kayttoonottopvm}}">{{ date ajoneuvonPerustiedot.kayttoonottopvm }}</td>
							{{#with ajoneuvonTiedot}}
								<td class="type">{{ default ajoneuvoluokka }}</td>
								<td class="make">{{ default merkkiSelvakielinen }}</td>
								<td class="model">{{ default mallimerkinta }}</td>
							{{else}}
								<td class="type">--</td>
								<td class="make">--</td>
								<td class="model">--</td>
							{{/with}}
						{{/with}}
					</tr>
				{{/each}}
				</tbody>
			</table>
		</div>

		<script src="https://cdnjs.cloudflare.com/ajax/libs/list.js/1.5.0/list.min.js"></script>
		<script>
			new List('list', {
				valueNames: [
					'id',
					'type',
					'reg',
					'vin',
					{ name: 'date', attr: 'data-timestamp' },
					'type',
					'make',
					'model'
				]
			});
		</script>
	</body>
</html>`);

		res.end(template({
			items: _.mapValues(ResultCollection.parsed, root => {
				const historia = _.get(root, 'kehys.sanoma.ajoneuvontiedot.historia');
				const laaja = _.get(root, 'kehys.sanoma.ajoneuvontiedot.laaja');
				const virhe = _.get(root, 'kehys.yleinen.virhe');

				return {
					error: virhe,
					type: laaja ? 'Laaja' : historia ? 'Historia' : '?',
					data: laaja || historia,
				}
			}),
		}));
	});

	app.post('/index.php', getResponse);
	app.post('/', getResponse);

	const server = http.createServer(app);

	server.listen(PORT, HOST);

	process.stdout.write(`listening to ${HOST}:${PORT}\n`);
}
