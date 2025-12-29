// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyAxQXgQLUEf3e6QXUVsB_OGAPOlgMOT-zs",
    authDomain: "stopwatch-app-87ca5.firebaseapp.com",
    projectId: "stopwatch-app-87ca5",
    storageBucket: "stopwatch-app-87ca5.firebasestorage.app",
    messagingSenderId: "204896064422",
    appId: "1:204896064422:web:3b71cda69615a74e4df567",
    measurementId: "G-Z10HK26LMX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, doc, setDoc, getDoc };
