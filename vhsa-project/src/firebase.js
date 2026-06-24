import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbE1YvEZRjolmS-W9cIkPjr3NoRrTu7u8",
  authDomain: "logistica-vhsa.firebaseapp.com",
  projectId: "logistica-vhsa",
  storageBucket: "logistica-vhsa.firebasestorage.app",
  messagingSenderId: "931204246337",
  appId: "1:931204246337:web:086e2099c59575b8de4fc0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
