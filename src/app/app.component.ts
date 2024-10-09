import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BoatingMapComponent } from './boating-map/boating-map.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, BoatingMapComponent], // Import BoatingMapComponent here
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'boat';
}
