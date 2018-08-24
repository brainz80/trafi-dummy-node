# trafi-dummy-node
Trafi dummy server (node-js version)

This is a dummy-server written in Node.js for queries to Trafi database.

Example request-body:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<kehys>
	<yleinen>
		<sanomatyyppi>TPSUOTIEDOTHAKUIN</sanomatyyppi>
		<sovellus>TPSUO</sovellus>
		<ymparisto>TUOTESTI</ymparisto>
		<kayttooikeudet>
			<tietojarjestelma>
				<tunnus>...</tunnus>
				<salasana>...</salasana>
			</tietojarjestelma>
		</kayttooikeudet>
	</yleinen>
	<sanoma>
		<ajoneuvonHakuehdot>
			<rekisteritunnus>AUT-0</rekisteritunnus>
			<laji>1</laji>
			<kyselylaji>640</kyselylaji>
			<kayttotarkoitus>4</kayttotarkoitus>
			<asiakas>...</asiakas>
			<soku-tunnus>...</soku-tunnus>
			<palvelutunnus>...</palvelutunnus>
		</ajoneuvonHakuehdot>
	</sanoma>
</kehys>
```
## Valid endpoints:

- `post` `/index.php` and `/` - query vehicle
- `get` `/info` - display list of valid vehicles.
