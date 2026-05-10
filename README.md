BAKE KING METAL FABRICATION SERVICES

Local Setup Instructions
1. File Organization
Before running the site, ensure your local directory matches the project structure. If images or styles are missing, check that the paths in your HTML (like href="bakekingStyle.css") match where you saved the files.

2. Linking Firebase
The database is already live, but your local copy needs the config keys to talk to it.

Open firebase-config.js.

Ensure your firebaseConfig object is updated with the latest keys from the Google Firebase Console.

Verify that auth and db are exported properly at the bottom of the script.

3. Running the Website
VS Code: Install the Live Server extension. Right-click bakeking_landing.html and select "Open with Live Server".